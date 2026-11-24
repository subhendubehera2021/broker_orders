import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSmartMoneyConcepts } from "../trading-view/smart-money-concepts.js";

const bar = (time, open, high, low, close) => ({ time, open, high, low, close });

const baseCandles = [
  bar(1, 6, 8, 5, 7),
  bar(2, 7, 10, 6, 9),
  bar(3, 9, 12, 8, 11),
  bar(4, 10, 11, 7, 9),
  bar(5, 6, 9, 5, 7),
  bar(6, 7, 11, 6, 10),
  bar(7, 10, 13, 9, 12.5),
  bar(8, 12, 12.5, 10, 11),
];

const shortPivotLengths = { internalPivotLength: 1, swingPivotLength: 2 };

test("detects internal and swing order blocks from the most extreme candle in the broken leg", () => {
  const result = calculateSmartMoneyConcepts(baseCandles, shortPivotLengths);

  assert.deepEqual(Object.keys(result), ["orderBlocks"]);
  for (const kind of ["internal", "swing"]) {
    assert.ok(result.orderBlocks[kind].some((block) =>
      block.kind === kind &&
      block.direction === 1 &&
      block.startTime === 5 &&
      block.top === 9 &&
      block.bottom === 5
    ));
  }
});

test("removes mitigated blocks and applies separate display lengths", () => {
  const candles = Array.from({ length: 4 }, (_, group) =>
    baseCandles.map(({ time, ...candle }) => {
      const offset = group * 20;
      return {
        ...candle,
        time: group * baseCandles.length + time,
        open: candle.open + offset,
        high: candle.high + offset,
        low: candle.low + offset,
        close: candle.close + offset,
      };
    })
  ).flat();
  const result = calculateSmartMoneyConcepts(candles, {
    ...shortPivotLengths,
    internalOrderBlockCount: 1,
    swingOrderBlockCount: 2,
  });

  assert.equal(result.orderBlocks.internal.length, 1);
  assert.equal(result.orderBlocks.swing.length, 2);

  const mitigated = calculateSmartMoneyConcepts([
    ...baseCandles,
    bar(9, 10, 12, 4, 10),
  ], shortPivotLengths);
  assert.deepEqual(mitigated.orderBlocks.internal, []);
  assert.deepEqual(mitigated.orderBlocks.swing, []);
});

test("rejects malformed candles and invalid order-block lengths", () => {
  assert.throws(() => calculateSmartMoneyConcepts(null), /Candles must be an array/);
  assert.throws(() => calculateSmartMoneyConcepts([
    bar(2, 6, 8, 5, 7),
    bar(1, 7, 10, 6, 9),
  ]), /valid and sorted by time/);
  assert.throws(() => calculateSmartMoneyConcepts([], { swingPivotLength: 1 }), /Swing pivot length/);
  assert.throws(() => calculateSmartMoneyConcepts([], { internalOrderBlockCount: 0 }), /between 1 and 20/);
  assert.throws(() => calculateSmartMoneyConcepts([], { swingOrderBlockCount: 21 }), /between 1 and 20/);
});
