import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchLiquiditySwings,
  findLatestLiquiditySwingHigh,
  recentIndiaDateRange,
} from "../src/internal/lib/liquidity-swings.js";

function makeBars() {
  return [
    { timestamp: "2024-01-01T00:00:00.000Z", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { timestamp: "2024-01-02T00:00:00.000Z", open: 2, high: 4, low: 1.5, close: 3, volume: 20 },
    { timestamp: "2024-01-03T00:00:00.000Z", open: 6, high: 8, low: 5, close: 7, volume: 30 },
    { timestamp: "2024-01-04T00:00:00.000Z", open: 4, high: 5, low: 3.5, close: 4.5, volume: 40 },
    { timestamp: "2024-01-05T00:00:00.000Z", open: 6.9, high: 7.5, low: 6.5, close: 7.2, volume: 50 },
    { timestamp: "2024-01-06T00:00:00.000Z", open: 7.3, high: 7.6, low: 6.8, close: 7, volume: 60 },
  ];
}

test("finds a confirmed swing high and counts later zone intersections", () => {
  const bars = makeBars().reverse();
  const swing = findLatestLiquiditySwingHigh(bars, { pivotLookback: 1 });

  assert.equal(swing.side, "high");
  assert.equal(swing.pivotTime, "2024-01-03T00:00:00.000Z");
  assert.equal(swing.confirmedAt, "2024-01-04T00:00:00.000Z");
  assert.equal(swing.intersectionCount, 2);
  assert.equal(swing.intersectionVolume, 110);
  assert.equal(swing.status, "qualified");
  assert.equal(bars[0].timestamp, "2024-01-06T00:00:00.000Z");
});

test("fetches and parses Fyers candles through the reusable history service", async () => {
  const candles = makeBars().map((bar) => [
    Date.parse(bar.timestamp) / 1000,
    bar.open,
    bar.high,
    bar.low,
    bar.close,
    bar.volume,
  ]);
  let request;
  const result = await fetchLiquiditySwings(
    " NSE:SBIN-EQ ",
    {
      fromDate: "2024-01-01",
      toDate: "2024-01-06",
      resolution: "D",
      pivotLookback: 1,
      contFlag: 1,
    },
    async (query) => {
      request = query;
      return { s: "ok", candles };
    },
  );

  assert.deepEqual(request, {
    symbol: "NSE:SBIN-EQ",
    resolution: "D",
    date_format: "1",
    range_from: "2024-01-01",
    range_to: "2024-01-06",
    cont_flag: "1",
  });
  assert.equal(result.bars.length, 6);
  assert.equal(result.swing.status, "qualified");
});

test("returns a recent date range using the India timezone", () => {
  assert.deepEqual(
    recentIndiaDateRange(new Date("2025-01-01T20:00:00.000Z"), 3),
    { fromDate: "2024-12-30", toDate: "2025-01-02" },
  );
});
