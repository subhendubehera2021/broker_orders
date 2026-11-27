import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PIVOT_LOOKBACK,
  findLiquiditySwings,
} from "../public/ui/liquidity-swings-indicator.js";

function makeCandles() {
  return [
    { time: 100, open: 9, high: 10, low: 8, close: 9, volume: 10 },
    { time: 160, open: 11, high: 12, low: 10, close: 11.5, volume: 20 },
    { time: 220, open: 14, high: 16, low: 13, close: 15, volume: 30 },
    { time: 280, open: 11, high: 12, low: 10, close: 11, volume: 40 },
    { time: 340, open: 12, high: 13, low: 11, close: 12, volume: 50 },
    { time: 400, open: 14, high: 15.5, low: 14, close: 15, volume: 60 },
  ];
}

test("chart liquidity swings finds high and low levels with touch volume", () => {
  const { highs, lows } = findLiquiditySwings(makeCandles().reverse(), 1);
  const high = highs[0];
  const low = lows[0];

  assert.equal(high.side, "high");
  assert.equal(high.pivotTime, 220);
  assert.equal(high.confirmedAt, 280);
  assert.equal(high.level, 16);
  assert.equal(high.intersectionCount, 1);
  assert.equal(high.intersectionVolume, 60);
  assert.equal(high.status, "qualified");
  assert.equal(low.side, "low");
  assert.equal(low.pivotTime, 280);
  assert.equal(low.level, 10);
});

test("chart liquidity swing waits for pivot confirmation and exposes the default", () => {
  assert.equal(DEFAULT_PIVOT_LOOKBACK, 5);
  assert.deepEqual(findLiquiditySwings(makeCandles().slice(0, 3), 1), {
    highs: [],
    lows: [],
  });
  assert.throws(() => findLiquiditySwings(makeCandles(), 0), RangeError);
});
