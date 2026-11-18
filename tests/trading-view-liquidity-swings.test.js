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
