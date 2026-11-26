import { createHash } from "node:crypto";
import { getTursoClient } from "../../db/turso-client.js";

const CREATE_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS auto_trade_liquidity_swing_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_symbol TEXT NOT NULL,
    option_type TEXT NOT NULL CHECK (option_type IN ('CE', 'PE')),
    resolution TEXT NOT NULL,
    pivot_lookback INTEGER NOT NULL CHECK (pivot_lookback > 0),
    pivot_time TEXT,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    swing_hash TEXT NOT NULL,
    swing_json TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    comment TEXT,
    is_traded INTEGER NOT NULL DEFAULT 0 CHECK (is_traded IN (0, 1)),
    buy_price REAL,
    sell_price REAL,
    high REAL,
    sl REAL,
    c_low REAL,
    qty INTEGER CHECK (qty IS NULL OR qty >= 0),
    p_l REAL,
    recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`;

const CHECK_HISTORY_COLUMNS = "PRAGMA table_info(auto_trade_liquidity_swing_history)";
const ADD_IS_DELETED_COLUMN = `
  ALTER TABLE auto_trade_liquidity_swing_history
  ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1))
`;
const ADD_PIVOT_TIME_COLUMN = `
  ALTER TABLE auto_trade_liquidity_swing_history
  ADD COLUMN pivot_time TEXT
`;
const HISTORY_COLUMN_MIGRATIONS = [
  ["is_deleted", ADD_IS_DELETED_COLUMN],
  ["pivot_time", ADD_PIVOT_TIME_COLUMN],
  ["comment", "ALTER TABLE auto_trade_liquidity_swing_history ADD COLUMN comment TEXT"],
  [
    "is_traded",
    "ALTER TABLE auto_trade_liquidity_swing_history "
      + "ADD COLUMN is_traded INTEGER NOT NULL DEFAULT 0 CHECK (is_traded IN (0, 1))",
  ],
  ["buy_price", "ALTER TABLE auto_trade_liquidity_swing_history ADD COLUMN buy_price REAL"],
  ["sell_price", "ALTER TABLE auto_trade_liquidity_swing_history ADD COLUMN sell_price REAL"],
  ["high", "ALTER TABLE auto_trade_liquidity_swing_history ADD COLUMN high REAL"],
  ["sl", "ALTER TABLE auto_trade_liquidity_swing_history ADD COLUMN sl REAL"],
  ["c_low", "ALTER TABLE auto_trade_liquidity_swing_history ADD COLUMN c_low REAL"],
  [
    "qty",
    "ALTER TABLE auto_trade_liquidity_swing_history "
      + "ADD COLUMN qty INTEGER CHECK (qty IS NULL OR qty >= 0)",
  ],
  ["p_l", "ALTER TABLE auto_trade_liquidity_swing_history ADD COLUMN p_l REAL"],
];
const BACKFILL_PIVOT_TIME = `
  UPDATE auto_trade_liquidity_swing_history
  SET pivot_time = CASE
    WHEN json_valid(swing_json) AND json_type(swing_json, '$.pivotTime') = 'text'
      THEN json_extract(swing_json, '$.pivotTime')
    ELSE NULL
  END
  WHERE pivot_time IS NULL
`;

const CREATE_HISTORY_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_auto_trade_liquidity_swing_latest
  ON auto_trade_liquidity_swing_history (
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    from_date,
    to_date,
    id DESC
  )
`;
const CHECK_DUPLICATE_SWING_KEYS = `
  SELECT
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    pivot_time,
    COUNT(*) AS duplicate_count,
    GROUP_CONCAT(id) AS duplicate_ids
  FROM auto_trade_liquidity_swing_history
  WHERE pivot_time IS NOT NULL
    AND is_deleted = 0
  GROUP BY option_symbol, option_type, resolution, pivot_lookback, pivot_time
  HAVING COUNT(*) > 1
  LIMIT 1
`;
const CREATE_UNIQUE_SWING_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_trade_liquidity_swing_unique_active
  ON auto_trade_liquidity_swing_history (
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    pivot_time
  )
  WHERE is_deleted = 0
`;
const DROP_OLD_UNIQUE_SWING_INDEX =
  "DROP INDEX IF EXISTS idx_auto_trade_liquidity_swing_unique";

const SELECT_EXISTING_SWING_KEY = `
  SELECT 1
  FROM auto_trade_liquidity_swing_history
  WHERE option_symbol = ?
    AND option_type = ?
    AND resolution = ?
    AND pivot_lookback = ?
    AND pivot_time = ?
  LIMIT 1
`;

const INSERT_HISTORY = `
  INSERT INTO auto_trade_liquidity_swing_history (
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    pivot_time,
    from_date,
    to_date,
    swing_hash,
    swing_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    pivot_time
  ) WHERE is_deleted = 0 DO NOTHING
`;

const SELECT_HISTORY_COLUMNS = `
  SELECT
    id,
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    from_date,
    to_date,
    pivot_time,
    swing_json,
    recorded_at,
    is_deleted,
    comment,
    is_traded,
    buy_price,
    sell_price,
    high,
    sl,
    c_low,
    qty,
    p_l
  FROM auto_trade_liquidity_swing_history
`;

const UPDATE_HISTORY_DELETED_STATUS = `
  UPDATE auto_trade_liquidity_swing_history
  SET is_deleted = ?
  WHERE id = ?
`;

const SELECT_HISTORY_DELETED_STATUS = `
  SELECT id, is_deleted
  FROM auto_trade_liquidity_swing_history
  WHERE id = ?
`;
const UPDATE_HISTORY_ANALYSIS = `
  UPDATE auto_trade_liquidity_swing_history
  SET comment = ?,
      is_traded = ?,
      buy_price = ?,
      sell_price = ?,
      high = ?,
      sl = ?,
      c_low = ?,
      qty = ?,
      p_l = ?
  WHERE id = ?
`;
const SELECT_HISTORY_ANALYSIS = `
  SELECT
    id,
    comment,
    is_traded,
    buy_price,
    sell_price,
    high,
    sl,
    c_low,
    qty,
    p_l
  FROM auto_trade_liquidity_swing_history
  WHERE id = ?
`;

const CHECK_LEGACY_STATE_TABLE = `
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'auto_trade_liquidity_swing_state'
  LIMIT 1
`;

const MIGRATE_LEGACY_STATE = `
  INSERT INTO auto_trade_liquidity_swing_history (
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    pivot_time,
    from_date,
    to_date,
    swing_hash,
    swing_json
  )
  SELECT
    state.option_symbol,
    state.option_type,
    state.resolution,
    state.pivot_lookback,
    CASE
      WHEN json_valid(state.swing_json)
        AND json_type(state.swing_json, '$.pivotTime') = 'text'
        THEN json_extract(state.swing_json, '$.pivotTime')
      ELSE NULL
    END,
    state.from_date,
    state.to_date,
    state.swing_hash,
    state.swing_json
  FROM auto_trade_liquidity_swing_state AS state
  WHERE NOT EXISTS (
    SELECT 1
    FROM auto_trade_liquidity_swing_history AS history
    WHERE history.option_symbol = state.option_symbol
      AND history.option_type = state.option_type
      AND history.resolution = state.resolution
      AND history.pivot_lookback = state.pivot_lookback
      AND history.pivot_time IS CASE
        WHEN json_valid(state.swing_json)
          AND json_type(state.swing_json, '$.pivotTime') = 'text'
          THEN json_extract(state.swing_json, '$.pivotTime')
        ELSE NULL
      END
  )
`;

const DROP_LEGACY_STATE_TABLE = "DROP TABLE auto_trade_liquidity_swing_state";

const initializedClients = new WeakMap();
const clientWriteQueues = new WeakMap();

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSwingResults(step2) {
  if (!isRecord(step2) || !Array.isArray(step2.contracts)) {
    throw new TypeError("Step 2 data must contain a contracts array");
  }

  return step2.contracts.flatMap((contract) => {
    if (
      !isRecord(contract) ||
      !["CE", "PE"].includes(contract.option_type) ||
      typeof contract.symbol !== "string" ||
      !isRecord(contract.liquiditySwings) ||
      typeof contract.liquiditySwings.fromDate !== "string" ||
      typeof contract.liquiditySwings.toDate !== "string" ||
      !Array.isArray(contract.liquiditySwings.configurations)
    ) {
      throw new TypeError("Step 2 data contains an invalid contract swing result");
    }

    return contract.liquiditySwings.configurations.flatMap((configuration) => {
      if (
        !isRecord(configuration) ||
        typeof configuration.resolution !== "string" ||
        !Number.isSafeInteger(configuration.pivotLookback) ||
        configuration.pivotLookback < 1 ||
        (configuration.swing !== null && !isRecord(configuration.swing))
      ) {
        throw new TypeError("Step 2 data contains an invalid swing configuration");
      }

      if (configuration.swing === null) {
        return [];
      }
      if (
        typeof configuration.swing.pivotTime !== "string" ||
        !Number.isFinite(Date.parse(configuration.swing.pivotTime))
      ) {
        throw new TypeError("Step 2 data contains a swing without a valid pivotTime");
      }

      const swingJson = JSON.stringify(configuration.swing);
      return [{
        optionSymbol: contract.symbol,
        optionType: contract.option_type,
        resolution: configuration.resolution,
        pivotLookback: configuration.pivotLookback,
        pivotTime: configuration.swing.pivotTime,
        fromDate: contract.liquiditySwings.fromDate,
        toDate: contract.liquiditySwings.toDate,
        swingHash: createHash("sha256").update(swingJson).digest("hex"),
        swingJson,
      }];
    });
  });
}

async function ensureSchema(client, { requireUnique = false } = {}) {
  let ready = initializedClients.get(client);
  if (!ready) {
    ready = (async () => {
      await client.execute(CREATE_HISTORY_TABLE);
      await client.execute(CREATE_HISTORY_INDEX);
      await client.execute(DROP_OLD_UNIQUE_SWING_INDEX);
      const historyColumns = await client.execute(CHECK_HISTORY_COLUMNS);
      const existingColumns = new Set(historyColumns.rows.map((column) => column.name));
      for (const [name, migration] of HISTORY_COLUMN_MIGRATIONS) {
        if (!existingColumns.has(name)) {
          await client.execute(migration);
        }
      }
      await client.execute(BACKFILL_PIVOT_TIME);
      const legacyState = await client.execute(CHECK_LEGACY_STATE_TABLE);
      if (legacyState.rows.length > 0) {
        const transaction = await client.transaction("write");
        try {
          await transaction.execute(MIGRATE_LEGACY_STATE);
          await transaction.execute(DROP_LEGACY_STATE_TABLE);
          await transaction.commit();
        } catch (error) {
          try {
            await transaction.rollback();
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "Migrating swing results failed and the transaction could not be rolled back.",
              { cause: error },
            );
          }
          throw error;
        }
      }
    })();
    initializedClients.set(client, ready);
  }

  try {
    await ready;
  } catch (error) {
    initializedClients.delete(client);
    throw error;
  }

  const duplicateKeys = await client.execute(CHECK_DUPLICATE_SWING_KEYS);
  if (duplicateKeys.rows.length > 0) {
    if (requireUnique) {
      const duplicate = duplicateKeys.rows[0];
      const error = new Error(
        "Duplicate active liquidity-swing keys exist. Soft-delete all but one row for "
        + `${duplicate.option_symbol} ${duplicate.option_type} `
        + `${duplicate.resolution}/${duplicate.pivot_lookback} `
        + `${duplicate.pivot_time} (row IDs: ${duplicate.duplicate_ids}) `
        + "before saving swing results.",
      );
      error.statusCode = 503;
      throw error;
    }
    return;
  }
  await client.execute(CREATE_UNIQUE_SWING_INDEX);
}

async function withClientWriteLock(client, operation) {
  const previous = clientWriteQueues.get(client) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  clientWriteQueues.set(client, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (clientWriteQueues.get(client) === queued) {
      clientWriteQueues.delete(client);
    }
  }
}

function identityArguments(row) {
  return [
    row.optionSymbol,
    row.optionType,
    row.resolution,
    row.pivotLookback,
    row.pivotTime,
  ];
}

function insertArguments(row) {
  return [
    ...identityArguments(row),
    row.fromDate,
    row.toDate,
    row.swingHash,
    row.swingJson,
  ];
}

async function saveRows(client, rows) {
  return withClientWriteLock(client, async () => {
    await ensureSchema(client, { requireUnique: true });
    const transaction = await client.transaction("write");
    let inserted = 0;
    let unchanged = 0;

    try {
      for (const row of rows) {
        const existing = await transaction.execute({
          sql: SELECT_EXISTING_SWING_KEY,
          args: identityArguments(row),
        });
        if (existing.rows.length > 0) {
          unchanged += 1;
          continue;
        }

        const result = await transaction.execute({
          sql: INSERT_HISTORY,
          args: insertArguments(row),
        });
        if (result.rowsAffected === 0) {
          unchanged += 1;
        } else {
          inserted += 1;
        }
      }

      await transaction.commit();
      return { inserted, unchanged };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Saving swing results failed and the transaction could not be rolled back.",
          { cause: error },
        );
      }
      throw error;
    }
  });
}

export async function saveChangedLiquiditySwings(
  step2,
  options = {},
) {
  const rows = collectSwingResults(step2);
  if (rows.length === 0) {
    return { inserted: 0, unchanged: 0 };
  }

  try {
    const client = options.client ?? getTursoClient();
    if (
      typeof client.execute !== "function" ||
      typeof client.transaction !== "function"
    ) {
      throw new TypeError("Turso client must support execute and transaction operations");
    }
    return await saveRows(client, rows);
  } catch (cause) {
    if (cause.statusCode === 503) {
      throw cause;
    }
    const error = new Error(
      "Unable to save liquidity-swing results to Turso.",
      { cause },
    );
    error.statusCode = 503;
    throw error;
  }
}

function buildHistoryFilters(options) {
  const conditions = [];
  const args = [];

  if (!options.includeDeleted) {
    conditions.push("is_deleted = 0");
  }
  if (options.resolution) {
    conditions.push("resolution = ?");
    args.push(options.resolution);
  }
  if (options.optionType) {
    conditions.push("option_type = ?");
    args.push(options.optionType);
  }
  if (options.lookback !== undefined) {
    conditions.push("pivot_lookback = ?");
    args.push(options.lookback);
  }
  if (options.status) {
    conditions.push(
      "CASE WHEN json_valid(swing_json) THEN json_extract(swing_json, '$.status') END = ?",
    );
    args.push(options.status);
  }
  if (options.traded !== undefined) {
    conditions.push("is_traded = ?");
    args.push(options.traded ? 1 : 0);
  }
  if (options.pivotTimeFrom) {
    conditions.push(
      "julianday(CASE WHEN json_valid(swing_json) THEN json_extract(swing_json, '$.pivotTime') END) >= julianday(?)",
    );
    args.push(options.pivotTimeFrom);
    conditions.push(
      "julianday(CASE WHEN json_valid(swing_json) THEN json_extract(swing_json, '$.pivotTime') END) < julianday(?)",
    );
    args.push(options.pivotTimeTo);
  }
  if (options.search) {
    conditions.push(`
      instr(
        lower(
          CAST(id AS TEXT) || ' ' || option_symbol || ' ' || option_type || ' ' ||
          resolution || ' ' || CAST(pivot_lookback AS TEXT) || ' ' ||
          from_date || ' ' || to_date || ' ' || swing_json || ' ' || recorded_at
        ),
        lower(?)
      ) > 0
    `);
    args.push(options.search);
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    args,
  };
}

export async function getLiquiditySwingHistory(options = {}) {
  const { limit = 50, offset = 0, includeDeleted = false } = options;

  try {
    const client = options.client ?? getTursoClient();
    if (typeof client.execute !== "function" || typeof client.transaction !== "function") {
      throw new TypeError("Turso client must support execute and transaction operations");
    }

    await ensureSchema(client);
    const filters = buildHistoryFilters({ ...options, includeDeleted });
    const countResult = await client.execute({
      sql: `
        SELECT COUNT(*) AS total
        FROM auto_trade_liquidity_swing_history
        ${filters.sql}
      `,
      args: filters.args,
    });
    const historyResult = await client.execute({
      sql: `
        ${SELECT_HISTORY_COLUMNS}
        ${filters.sql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `,
      args: [...filters.args, limit, offset],
    });
    const total = Number(countResult.rows[0]?.total ?? 0);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new RangeError("Turso returned an invalid liquidity-swing history count");
    }

    return {
      rows: historyResult.rows.map((row) => ({
        ...row,
        is_deleted: Number(row.is_deleted) === 1,
        is_traded: Number(row.is_traded) === 1,
      })),
      total,
      limit,
      offset,
    };
  } catch (cause) {
    if (cause?.statusCode === 503) {
      throw cause;
    }
    const error = new Error(
      "Unable to load liquidity-swing history from Turso.",
      { cause },
    );
    error.statusCode = 503;
    throw error;
  }
}

export async function setLiquiditySwingDeleted(id, isDeleted, options = {}) {
  try {
    const client = options.client ?? getTursoClient();
    if (typeof client.execute !== "function" || typeof client.transaction !== "function") {
      throw new TypeError("Turso client must support execute and transaction operations");
    }

    await ensureSchema(client);
    await client.execute({
      sql: UPDATE_HISTORY_DELETED_STATUS,
      args: [isDeleted ? 1 : 0, id],
    });
    const result = await client.execute({
      sql: SELECT_HISTORY_DELETED_STATUS,
      args: [id],
    });
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      is_deleted: Number(row.is_deleted) === 1,
    };
  } catch (cause) {
    if (cause?.statusCode === 503) {
      throw cause;
    }
    const error = new Error(
      "Unable to update liquidity-swing history in Turso.",
      { cause },
    );
    error.statusCode = 503;
    throw error;
  }
}

export async function setLiquiditySwingAnalysis(id, analysis, options = {}) {
  try {
    const client = options.client ?? getTursoClient();
    if (typeof client.execute !== "function" || typeof client.transaction !== "function") {
      throw new TypeError("Turso client must support execute and transaction operations");
    }

    await ensureSchema(client);
    await client.execute({
      sql: UPDATE_HISTORY_ANALYSIS,
      args: [
        analysis.comment,
        analysis.is_traded ? 1 : 0,
        analysis.buy_price,
        analysis.sell_price,
        analysis.high,
        analysis.sl,
        analysis.c_low,
        analysis.qty,
        analysis.p_l,
        id,
      ],
    });
    const result = await client.execute({
      sql: SELECT_HISTORY_ANALYSIS,
      args: [id],
    });
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      ...row,
      id: Number(row.id),
      is_traded: Number(row.is_traded) === 1,
    };
  } catch (cause) {
    if (cause?.statusCode === 503) {
      throw cause;
    }
    const error = new Error(
      "Unable to update liquidity-swing analysis in Turso.",
      { cause },
    );
    error.statusCode = 503;
    throw error;
  }
}
