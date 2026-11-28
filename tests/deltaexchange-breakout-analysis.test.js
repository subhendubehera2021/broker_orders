import assert from "node:assert/strict";
import test from "node:test";
import { analyzeLiquidityBreakouts } from "../src/deltaexchange/lib/liquidity-breakouts.js";
import { findLiquiditySwings } from "../src/deltaexchange/lib/liquidity-swings.js";

function makeSwing(side, level, brokenAt) {
  return {
    side,
    level,
    pivotTime: new Date((Number(brokenAt) - 600) * 1000).toISOString(),
    confirmedAt: new Date((Number(brokenAt) - 300) * 1000).toISOString(),
    brokenAt: new Date(Number(brokenAt) * 1000).toISOString(),
    status: "broken",
  };
}

test("a wick through a swing level breaks it even if the candle closes back inside", () => {
  const highs = [100, 101, 102, 103, 104, 120, 110, 109, 108, 107, 106, 121];
  const bars = highs.map((high, index) => {
    const time = (index + 1) * 60;
    return {
      timestamp: new Date(time * 1000).toISOString(),
      open: high - 2,
      high,
      low: high - 5,
      close: high - 1,
      volume: index + 1,
    };
  });
  bars[11].open = 119;
  bars[11].low = 118;
  bars[11].close = 119;

  const result = findLiquiditySwings(bars, { pivotLookback: 5 });
  const swing = result.highs.find((candidate) => candidate.level === 120);

  assert.equal(swing.status, "broken");
  assert.equal(swing.brokenAt, bars[11].timestamp);
});

test("a newer same-direction pivot replaces an older level before its later break", () => {
  const highs = [10, 15, 11, 12, 14, 11, 16, 13];
  const bars = highs.map((high, index) => ({
    timestamp: new Date((index + 1) * 60_000).toISOString(),
    open: high - 1,
    high,
    low: high - 2,
    close: high - 1,
    volume: 1,
  }));
  const result = findLiquiditySwings(bars, { pivotLookback: 1 });

  assert.deepEqual(
    result.highs.map(({ level, status }) => ({ level, status })),
    [
      { level: 14, status: "broken" },
      { level: 16, status: "tracking" },
    ],
  );
});

test("measures favorable points to stop-out for upside and downside breaks", () => {
  const upsideCandles = [
    { time: 1000, open: 9.5, high: 11, low: 9, close: 10.5, volume: 1 },
    { time: 1060, open: 10.5, high: 15, low: 10, close: 14, volume: 1 },
    { time: 1120, open: 14, high: 14.5, low: 9.5, close: 10, volume: 1 },
    { time: 1180, open: 10, high: 10.5, low: 8.5, close: 9, volume: 1 },
  ];
  const upside = analyzeLiquidityBreakouts(
    upsideCandles,
    { highs: [makeSwing("high", 10, 1000)], lows: [] },
  )[0];

  assert.equal(upside.stopLoss, 9);
  assert.equal(upside.breakoutExtreme, 11);
  assert.equal(upside.maxFavorablePoints, 5);
  assert.equal(upside.maxFavorableTime, 1060);
  assert.equal(upside.stopHitAt, 1180);

  const downsideCandles = [
    { time: 2000, open: 10.2, high: 10.5, low: 9, close: 9.5, volume: 1 },
    { time: 2060, open: 9.5, high: 10, low: 5, close: 6, volume: 1 },
    { time: 2120, open: 6, high: 10.6, low: 5.5, close: 7, volume: 1 },
  ];
  const downside = analyzeLiquidityBreakouts(
    downsideCandles,
    { highs: [], lows: [makeSwing("low", 10, 2000)] },
  )[0];

  assert.equal(downside.stopLoss, 10.5);
  assert.equal(downside.breakoutExtreme, 9);
  assert.equal(downside.maxFavorablePoints, 5);
  assert.equal(downside.stopHitAt, 2120);
});
