import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  getLiquiditySwingHistory,
  saveChangedLiquiditySwings,
  setLiquiditySwingAnalysis,
  setLiquiditySwingDeleted,
} from "../src/auto-trade-process/repositories/liquidity-swing.repository.js";

function makeStepTwo(level, pivotTime = "2026-11-25T10:00:00.000Z") {
  return {
    selectedCount: 1,
    totalVolume: 1000,
    contracts: [
      {
        option_type: "CE",
        symbol: "NSE:NIFTYCE",
        ltp: 120,
        volume: 1000,
        liquiditySwings: {
          fromDate: "2026-11-22",
          toDate: "2026-11-25",
          configurations: [
            {
              resolution: "1",
              pivotLookback: 5,
              swing: {
                side: "high",
                level,
                status: "tracking",
                pivotTime,
              },
            },
          ],
        },
      },
    ],
  };
}

test("stores one row per pivot key and ignores later results for that key", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    const initial = makeStepTwo(120);
    assert.deepEqual(
      await saveChangedLiquiditySwings(initial, { client }),
      { inserted: 1, unchanged: 0 },
    );
    assert.deepEqual(
      await saveChangedLiquiditySwings(initial, { client }),
      { inserted: 0, unchanged: 1 },
    );
    assert.deepEqual(
      await saveChangedLiquiditySwings(makeStepTwo(121), { client }),
      { inserted: 0, unchanged: 1 },
    );
    assert.deepEqual(
      await saveChangedLiquiditySwings(initial, { client }),
      { inserted: 0, unchanged: 1 },
    );

    const history = await client.execute(
      "SELECT swing_json FROM auto_trade_liquidity_swing_history ORDER BY id",
    );
    assert.equal(history.rows.length, 1);
    assert.equal(JSON.parse(history.rows[0].swing_json).level, 120);
  } finally {
    await client.close();
  }
});

test("returns newest swing history rows with pagination metadata", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    assert.deepEqual(
      await getLiquiditySwingHistory({ client, limit: 2, offset: 0 }),
      { rows: [], total: 0, limit: 2, offset: 0 },
    );
    await saveChangedLiquiditySwings(makeStepTwo(120), { client });
    await saveChangedLiquiditySwings(
      makeStepTwo(121, "2026-11-25T10:01:00.000Z"),
      { client },
    );
    await saveChangedLiquiditySwings(
      makeStepTwo(120, "2026-11-25T10:02:00.000Z"),
      { client },
    );

    const firstPage = await getLiquiditySwingHistory({ client, limit: 2, offset: 0 });
    assert.equal(firstPage.total, 3);
    assert.deepEqual(firstPage.rows.map((row) => row.id), [3, 2]);
    assert.deepEqual(
      firstPage.rows.map((row) => JSON.parse(row.swing_json).level),
      [120, 121],
    );
    assert.equal(firstPage.rows[0].option_symbol, "NSE:NIFTYCE");
    assert.equal(firstPage.rows[0].option_type, "CE");
    assert.equal(firstPage.rows[0].pivot_time, "2026-11-25T10:02:00.000Z");
    assert.equal(firstPage.rows[0].is_deleted, false);

    assert.deepEqual(
      await setLiquiditySwingDeleted(3, true, { client }),
      { id: 3, is_deleted: true },
    );
    const activeHistory = await getLiquiditySwingHistory({ client, limit: 10 });
    assert.equal(activeHistory.total, 2);
    const allHistory = await getLiquiditySwingHistory({
      client,
      limit: 10,
      includeDeleted: true,
    });
    assert.equal(allHistory.total, 3);
    assert.equal(allHistory.rows[0].is_deleted, true);
    assert.deepEqual(
      await setLiquiditySwingDeleted(3, false, { client }),
      { id: 3, is_deleted: false },
    );

    const nextPage = await getLiquiditySwingHistory({ client, limit: 2, offset: 2 });
    assert.equal(nextPage.total, 3);
    assert.deepEqual(nextPage.rows.map((row) => row.id), [1]);
  } finally {
    await client.close();
  }
});

test("stores manually updated swing analysis fields", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await saveChangedLiquiditySwings(makeStepTwo(120), { client });
    const initial = await getLiquiditySwingHistory({ client });
    assert.equal(initial.rows[0].is_traded, false);
    assert.equal(initial.rows[0].comment, null);
    assert.equal(initial.rows[0].buy_price, null);

    const updated = await setLiquiditySwingAnalysis(1, {
      comment: "Entry confirmed",
      is_traded: true,
      buy_price: 101.5,
      sell_price: 103,
      high: 110,
      sl: 95,
      c_low: 98.5,
      qty: 2,
      p_l: 3,
    }, { client });
    assert.deepEqual(updated, {
      id: 1,
      comment: "Entry confirmed",
      is_traded: true,
      buy_price: 101.5,
      sell_price: 103,
      high: 110,
      sl: 95,
      c_low: 98.5,
      qty: 2,
      p_l: 3,
    });

    const missing = await setLiquiditySwingAnalysis(999, {
      comment: null,
      is_traded: false,
      buy_price: null,
      sell_price: null,
      high: null,
      sl: null,
      c_low: null,
      qty: null,
      p_l: null,
    }, { client });
    assert.equal(missing, null);
  } finally {
    await client.close();
  }
});

test("filters and paginates history rows in the database", async () => {
  const client = createClient({ url: "file::memory:" });
  const records = [
    { type: "CE", resolution: "1", lookback: 5, status: "tracking", pivotTime: "2026-04-01T10:00:00+05:30" },
    { type: "PE", resolution: "3", lookback: 7, status: "broken", pivotTime: "2026-04-01T12:00:00+05:30" },
    { type: "CE", resolution: "5", lookback: 14, status: "qualified", pivotTime: "2026-04-02T00:30:00Z" },
  ];

  try {
    await saveChangedLiquiditySwings({
      contracts: records.map((record, index) => ({
        option_type: record.type,
        symbol: `NSE:SERVER-FILTER-${record.status.toUpperCase()}`,
        liquiditySwings: {
          fromDate: "2026-04-01",
          toDate: "2026-04-02",
          configurations: [{
            resolution: record.resolution,
            pivotLookback: record.lookback,
            swing: {
              status: record.status,
              level: 100 + index,
              pivotTime: record.pivotTime,
            },
          }],
        },
      })),
    }, { client });

    await setLiquiditySwingAnalysis(1, {
      comment: null,
      is_traded: true,
      buy_price: null,
      sell_price: null,
      high: null,
      sl: null,
      c_low: null,
      qty: null,
      p_l: null,
    }, { client });
    assert.equal((await getLiquiditySwingHistory({ client, traded: true })).total, 1);
    assert.equal((await getLiquiditySwingHistory({ client, traded: false })).total, 2);

    const firstPage = await getLiquiditySwingHistory({
      client,
      search: "server-filter",
      limit: 2,
      offset: 0,
    });
    assert.equal(firstPage.total, 3);
    assert.deepEqual(firstPage.rows.map((row) => row.id), [3, 2]);

    const filtered = await getLiquiditySwingHistory({
      client,
      optionType: "CE",
      resolution: "5",
      lookback: 14,
      status: "qualified",
      pivotTimeFrom: "2026-04-02T00:00:00.000Z",
      pivotTimeTo: "2026-04-03T00:00:00.000Z",
      search: "filter-qualified",
      limit: 1,
      offset: 0,
    });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.rows[0].option_symbol, "NSE:SERVER-FILTER-QUALIFIED");

    await setLiquiditySwingDeleted(filtered.rows[0].id, true, { client });
    const active = await getLiquiditySwingHistory({
      client,
      status: "qualified",
    });
    assert.equal(active.total, 0);

    const includingDeleted = await getLiquiditySwingHistory({
      client,
      status: "qualified",
      includeDeleted: true,
    });
    assert.equal(includingDeleted.total, 1);
    assert.equal(includingDeleted.rows[0].is_deleted, true);
  } finally {
    await client.close();
  }
});

test("adds is_deleted to an existing history table without deleting rows", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    await client.execute(`
      CREATE TABLE auto_trade_liquidity_swing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        option_symbol TEXT NOT NULL,
        option_type TEXT NOT NULL,
        resolution TEXT NOT NULL,
        pivot_lookback INTEGER NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        swing_hash TEXT NOT NULL,
        swing_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `);
    await client.execute({
      sql: `
        INSERT INTO auto_trade_liquidity_swing_history (
          option_symbol,
          option_type,
          resolution,
          pivot_lookback,
          from_date,
          to_date,
          swing_hash,
          swing_json,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        "NSE:NIFTYCE",
        "CE",
        "1",
        5,
        "2026-11-22",
        "2026-11-25",
        "old-hash",
        JSON.stringify({ side: "high", level: 120 }),
        "2026-11-25T12:00:00Z",
      ],
    });

    const history = await getLiquiditySwingHistory({ client });
    assert.equal(history.total, 1);
    assert.equal(history.rows[0].option_symbol, "NSE:NIFTYCE");
    assert.equal(history.rows[0].is_deleted, false);
  } finally {
    await client.close();
  }
});

test("does not save swing results without a pivot time", async () => {
  const stepTwo = makeStepTwo(120);
  stepTwo.contracts[0].liquiditySwings.configurations[0].swing = null;

  assert.deepEqual(
    await saveChangedLiquiditySwings(stepTwo),
    { inserted: 0, unchanged: 0 },
  );
});

test("allows duplicate rows to be soft-deleted before enforcing active uniqueness", async () => {
  const client = createClient({ url: "file::memory:" });
  const swing = JSON.stringify({
    side: "high",
    level: 120,
    status: "tracking",
    pivotTime: "2026-11-25T10:00:00.000Z",
  });

  try {
    await client.execute(`
      CREATE TABLE auto_trade_liquidity_swing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        option_symbol TEXT NOT NULL,
        option_type TEXT NOT NULL,
        resolution TEXT NOT NULL,
        pivot_lookback INTEGER NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        swing_hash TEXT NOT NULL,
        swing_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      )
    `);
    for (let index = 0; index < 2; index += 1) {
      await client.execute({
        sql: `
          INSERT INTO auto_trade_liquidity_swing_history (
            option_symbol,
            option_type,
            resolution,
            pivot_lookback,
            from_date,
            to_date,
            swing_hash,
            swing_json,
            recorded_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          "NSE:NIFTYCE",
          "CE",
          "1",
          5,
          "2026-11-22",
          "2026-11-25",
          `hash-${index}`,
          swing,
          `2026-11-25T10:0${index}:00Z`,
        ],
      });
    }

    assert.equal(
      (await getLiquiditySwingHistory({ client, includeDeleted: true })).total,
      2,
    );
    await assert.rejects(
      saveChangedLiquiditySwings(makeStepTwo(120), { client }),
      (error) => (
        error.statusCode === 503 &&
        error.message.includes("Duplicate active liquidity-swing keys exist")
      ),
    );

    assert.deepEqual(
      await setLiquiditySwingDeleted(2, true, { client }),
      { id: 2, is_deleted: true },
    );
    assert.equal((await getLiquiditySwingHistory({ client })).total, 1);
    assert.equal(
      (await getLiquiditySwingHistory({ client, includeDeleted: true })).total,
      2,
    );
    assert.deepEqual(
      await saveChangedLiquiditySwings(makeStepTwo(120), { client }),
      { inserted: 0, unchanged: 1 },
    );
    const indexes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_auto_trade_liquidity_swing_unique_active'",
    );
    assert.equal(indexes.rows.length, 1);
  } finally {
    await client.close();
  }
});

test("migrates the old state table into history and removes it", async () => {
  const client = createClient({ url: "file::memory:" });
  const swing = {
    side: "high",
    level: 120,
    status: "tracking",
    pivotTime: "2026-11-25T10:00:00.000Z",
  };
  const swingJson = JSON.stringify(swing);
  const swingHash = createHash("sha256").update(swingJson).digest("hex");

  try {
    await client.execute(`
      CREATE TABLE auto_trade_liquidity_swing_state (
        option_symbol TEXT NOT NULL,
        option_type TEXT NOT NULL,
        resolution TEXT NOT NULL,
        pivot_lookback INTEGER NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        swing_hash TEXT NOT NULL,
        swing_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (
          option_symbol,
          option_type,
          resolution,
          pivot_lookback,
          from_date,
          to_date
        )
      )
    `);
    await client.execute({
      sql: `
        INSERT INTO auto_trade_liquidity_swing_state
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        "NSE:NIFTYCE",
        "CE",
        "1",
        5,
        "2026-11-22",
        "2026-11-25",
        swingHash,
        swingJson,
        "2026-11-25T12:00:00Z",
      ],
    });

    assert.deepEqual(
      await saveChangedLiquiditySwings(makeStepTwo(120), { client }),
      { inserted: 0, unchanged: 1 },
    );
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'auto_trade_liquidity_swing_%'",
    );
    assert.deepEqual(tables.rows.map(({ name }) => name), [
      "auto_trade_liquidity_swing_history",
    ]);
  } finally {
    await client.close();
  }
});

test("does not need a database connection when there are no selected contracts", async () => {
  assert.deepEqual(
    await saveChangedLiquiditySwings({ selectedCount: 0, contracts: [] }),
    { inserted: 0, unchanged: 0 },
  );
});

test("concurrent identical results create only one history row", async () => {
  const client = createClient({ url: "file::memory:" });

  try {
    const results = await Promise.all([
      saveChangedLiquiditySwings(makeStepTwo(120), { client }),
      saveChangedLiquiditySwings(makeStepTwo(120), { client }),
    ]);
    assert.equal(
      results.reduce((total, result) => total + result.inserted, 0),
      1,
    );

    const history = await client.execute(
      "SELECT COUNT(*) AS count FROM auto_trade_liquidity_swing_history",
    );
    assert.equal(Number(history.rows[0].count), 1);
  } finally {
    await client.close();
  }
});
