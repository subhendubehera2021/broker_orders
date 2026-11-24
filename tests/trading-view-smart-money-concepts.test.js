import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateSmartMoneyConcepts,
  evaluateOrderBlockSetup,
} from "../trading-view/smart-money-concepts.js";

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

const shortPivotLengths = { internalPivotLength: 2, swingPivotLength: 2 };

test("detects internal and swing order blocks with configurable pivot lengths", () => {
  const result = calculateSmartMoneyConcepts(baseCandles, shortPivotLengths);

  assert.equal(result.internal.bias, 1);
  assert.equal(result.swing.bias, 1);
  for (const kind of ["internal", "swing"]) {
    assert.ok(result.orderBlocks[kind].some((block) =>
      block.kind === kind &&
      block.direction === 1 &&
      block.startTime === 5 &&
      block.createdTime === 7 &&
      block.top === 9 &&
      block.bottom === 5 &&
      block.status === "fresh"
    ));
  }

  assert.deepEqual(
    calculateSmartMoneyConcepts(baseCandles),
    calculateSmartMoneyConcepts(baseCandles, { internalPivotLength: 11, swingPivotLength: 11 }),
  );
});

test("classifies mitigated and invalidated zones without losing their lifecycle", () => {
  const mitigated = calculateSmartMoneyConcepts([
    ...baseCandles,
    bar(9, 6, 11, 4, 6),
  ], shortPivotLengths);
  const invalidated = calculateSmartMoneyConcepts([
    ...baseCandles,
    bar(9, 4, 5, 3, 4),
  ], shortPivotLengths);

  assert.equal(mitigated.orderBlocks.internal[0].status, "mitigated");
  assert.equal(invalidated.orderBlocks.internal[0].status, "invalidated");
});

test("applies the fixed recent-block cap and rejects invalid pivot lengths", () => {
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
  });

  assert.ok(result.orderBlocks.internal.length <= 11);
  assert.ok(result.orderBlocks.swing.length <= 11);
  assert.throws(() => calculateSmartMoneyConcepts([], { internalPivotLength: 1 }), /between 2 and 50/);
  assert.throws(() => calculateSmartMoneyConcepts([], { swingPivotLength: 51 }), /between 2 and 50/);
});

test("marks a setup as reviewable only after a visible retest and later internal confirmation", () => {
  const swing = calculateSmartMoneyConcepts(baseCandles, shortPivotLengths);
  const setupCandles = [
    ...baseCandles,
    bar(9, 8, 9, 6, 8),
    bar(10, 11, 14, 11, 13),
    bar(11, 13, 14, 12, 13),
  ];
  const swingBlocks = [
    ...swing.orderBlocks.swing,
    {
      createdTime: 9,
      direction: -1,
      status: "fresh",
      top: 20,
      bottom: 15,
    },
  ];
  const ready = evaluateOrderBlockSetup({
    swingBlocks,
    swingBias: swing.swing.bias,
    internalEvents: [{ direction: 1, time: 10 }],
    candles: setupCandles,
  });
  const waiting = evaluateOrderBlockSetup({
    swingBlocks,
    swingBias: swing.swing.bias,
    internalEvents: [],
    candles: setupCandles,
  });
  const invalidated = evaluateOrderBlockSetup({
    swingBlocks,
    swingBias: swing.swing.bias,
    internalEvents: [{ direction: 1, time: 10 }],
    candles: [...setupCandles, bar(12, 5, 6, 3, 4)],
  });

  assert.equal(ready.state, "review");
  assert.equal(ready.checks.every((check) => check.state === "pass"), true);
  assert.equal(waiting.state, "waiting");
  assert.equal(invalidated.state, "invalid");
});

test("rejects malformed candles and invalid order-block lengths", () => {
  assert.throws(() => calculateSmartMoneyConcepts(null), /Candles must be an array/);
  assert.throws(() => calculateSmartMoneyConcepts([
    bar(2, 6, 8, 5, 7),
    bar(1, 7, 10, 6, 9),
  ]), /valid and sorted by time/);
  assert.throws(() => calculateSmartMoneyConcepts([], { orderBlockCount: 0 }), /between 1 and 20/);
  assert.deepEqual(evaluateOrderBlockSetup({ candles: [] }).state, "waiting");
});
