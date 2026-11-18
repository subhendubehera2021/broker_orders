import assert from "node:assert/strict";
import { test } from "node:test";
import { findLiquiditySwings } from "../trading-view/liquidity-swings.js";

test("extends each liquidity swing level to the next swing of the same side", () => {
  const bars = [
    { time: 1, high: 1, low: 9 },
    { time: 2, high: 5, low: 4 },
    { time: 3, high: 2, low: 8 },
    { time: 4, high: 4, low: 3 },
    { time: 5, high: 1, low: 7 },
    { time: 6, high: 6, low: 2 },
    { time: 7, high: 3, low: 6 },
    { time: 8, high: 2, low: 1 },
  ];

  const swings = findLiquiditySwings(bars, 1);
  const highs = swings.filter((swing) => swing.side === "high");
  const lows = swings.filter((swing) => swing.side === "low");

  assert.deepEqual(highs.map(({ startTime, endTime }) => [startTime, endTime]), [
    [2, 4],
    [4, 6],
    [6, 8],
  ]);
  assert.deepEqual(lows.map(({ startTime, endTime }) => [startTime, endTime]), [
    [2, 4],
    [4, 6],
    [6, 8],
  ]);
});

test("builds a short pivot wick zone and totals volume until the next same-side swing", () => {
  const bars = [
    { time: 1, open: 5, close: 6, high: 7, low: 4, volume: 100 },
    { time: 2, open: 8, close: 9, high: 10, low: 7, volume: 100 },
    { time: 3, open: 6, close: 7, high: 8, low: 5, volume: 200 },
    { time: 4, open: 10, close: 10.5, high: 11, low: 6, volume: 300 },
    { time: 5, open: 7, close: 8, high: 9, low: 5, volume: 400 },
    { time: 6, open: 6, close: 7, high: 8, low: 2, volume: 500 },
  ];

  const firstHigh = findLiquiditySwings(bars, 1).find((swing) => swing.side === "high");

  assert.deepEqual({
    startTime: firstHigh.startTime,
    endTime: firstHigh.endTime,
    zoneEndTime: firstHigh.zoneEndTime,
    zoneTop: firstHigh.zoneTop,
    zoneBottom: firstHigh.zoneBottom,
    volume: firstHigh.volume,
    breakTime: firstHigh.breakTime,
    breakVolume: firstHigh.breakVolume,
  }, {
    startTime: 2,
    endTime: 4,
    zoneEndTime: 3,
    zoneTop: 10,
    zoneBottom: 9,
    volume: 300,
    breakTime: 4,
    breakVolume: 300,
  });
});

test("detects the first candle that wicks below a swing low", () => {
  const bars = [
    { time: 1, high: 10, low: 5, volume: 10 },
    { time: 2, high: 9, low: 3, volume: 20 },
    { time: 3, high: 8, low: 4, volume: 30 },
    { time: 4, high: 9, low: 2, volume: 40 },
    { time: 5, high: 8, low: 3, volume: 50 },
  ];

  const firstLow = findLiquiditySwings(bars, 1).find((swing) => swing.side === "low");

  assert.equal(firstLow.startTime, 2);
  assert.equal(firstLow.breakTime, 4);
  assert.equal(firstLow.breakVolume, 40);
});
