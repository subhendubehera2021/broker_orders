import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createClient } from "@libsql/client";
import { saveChangedLiquiditySwings } from "../src/auto-trade-process/repositories/liquidity-swing.repository.js";

function makeStepTwo(level) {
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
              swing: { side: "high", level, status: "tracking" },
            },
          ],
        },
      },
    ],
  };
}

test("persists only swing changes and records later transitions", async () => {
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
      { inserted: 1, unchanged: 0 },
    );
    assert.deepEqual(
      await saveChangedLiquiditySwings(initial, { client }),
      { inserted: 1, unchanged: 0 },
    );

    const history = await client.execute(
      "SELECT swing_json FROM auto_trade_liquidity_swing_history ORDER BY id",
    );
    assert.equal(history.rows.length, 3);
    assert.deepEqual(
      history.rows.map(({ swing_json }) => JSON.parse(swing_json).level),
      [120, 121, 120],
    );

    const latest = await client.execute(
      "SELECT swing_json FROM auto_trade_liquidity_swing_history ORDER BY id DESC LIMIT 1",
    );
    assert.equal(JSON.parse(latest.rows[0].swing_json).level, 120);
  } finally {
    await client.close();
  }
});

test("migrates the old state table into history and removes it", async () => {
  const client = createClient({ url: "file::memory:" });
  const swing = { side: "high", level: 120, status: "tracking" };
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
