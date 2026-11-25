import { createHash } from "node:crypto";
import { getTursoClient } from "../../db/turso-client.js";

const CREATE_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS auto_trade_liquidity_swing_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_symbol TEXT NOT NULL,
    option_type TEXT NOT NULL CHECK (option_type IN ('CE', 'PE')),
    resolution TEXT NOT NULL,
    pivot_lookback INTEGER NOT NULL CHECK (pivot_lookback > 0),
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    swing_hash TEXT NOT NULL,
    swing_json TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
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

const SELECT_LATEST_HISTORY = `
  SELECT swing_hash
  FROM auto_trade_liquidity_swing_history
  WHERE option_symbol = ?
    AND option_type = ?
    AND resolution = ?
    AND pivot_lookback = ?
    AND from_date = ?
    AND to_date = ?
  ORDER BY id DESC
  LIMIT 1
`;

const INSERT_HISTORY = `
  INSERT INTO auto_trade_liquidity_swing_history (
    option_symbol,
    option_type,
    resolution,
    pivot_lookback,
    from_date,
    to_date,
    swing_hash,
    swing_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      AND history.from_date = state.from_date
      AND history.to_date = state.to_date
      AND history.id = (
        SELECT MAX(latest.id)
        FROM auto_trade_liquidity_swing_history AS latest
        WHERE latest.option_symbol = state.option_symbol
          AND latest.option_type = state.option_type
          AND latest.resolution = state.resolution
          AND latest.pivot_lookback = state.pivot_lookback
          AND latest.from_date = state.from_date
          AND latest.to_date = state.to_date
      )
      AND history.swing_hash = state.swing_hash
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

    return contract.liquiditySwings.configurations.map((configuration) => {
      if (
        !isRecord(configuration) ||
        typeof configuration.resolution !== "string" ||
        !Number.isSafeInteger(configuration.pivotLookback) ||
        configuration.pivotLookback < 1 ||
        (configuration.swing !== null && !isRecord(configuration.swing))
      ) {
        throw new TypeError("Step 2 data contains an invalid swing configuration");
      }

      const swingJson = JSON.stringify(configuration.swing);
      return {
        optionSymbol: contract.symbol,
        optionType: contract.option_type,
        resolution: configuration.resolution,
        pivotLookback: configuration.pivotLookback,
        fromDate: contract.liquiditySwings.fromDate,
        toDate: contract.liquiditySwings.toDate,
        swingHash: createHash("sha256").update(swingJson).digest("hex"),
        swingJson,
      };
    });
  });
}

async function ensureSchema(client) {
  let ready = initializedClients.get(client);
  if (!ready) {
    ready = (async () => {
      await client.execute(CREATE_HISTORY_TABLE);
      await client.execute(CREATE_HISTORY_INDEX);
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
    row.fromDate,
    row.toDate,
  ];
}

function insertArguments(row) {
  return [...identityArguments(row), row.swingHash, row.swingJson];
}

async function saveRows(client, rows) {
  return withClientWriteLock(client, async () => {
    await ensureSchema(client);
    const transaction = await client.transaction("write");
    let inserted = 0;
    let unchanged = 0;

    try {
      for (const row of rows) {
        const current = await transaction.execute({
          sql: SELECT_LATEST_HISTORY,
          args: identityArguments(row),
        });
        if (current.rows[0]?.swing_hash === row.swingHash) {
          unchanged += 1;
          continue;
        }

        const args = insertArguments(row);
        await transaction.execute({ sql: INSERT_HISTORY, args });
        inserted += 1;
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
