import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateSmartMoneyConcepts } from "../trading-view/smart-money-concepts.js";

const bar = (time, open, high, low, close, volume = 100) => ({
  time,
  open,
  high,
  low,
  close,
  volume,
});

test("detects confirmed pivots and classifies a bullish structure break", () => {
  const candles = [
    bar(1, 6, 8, 5, 7),
    bar(2, 7, 10, 6, 9),
    bar(3, 9, 12, 8, 11),
    bar(4, 10, 11, 7, 9),
    bar(5, 6, 9, 5, 7),
    bar(6, 7, 11, 6, 10),
    bar(7, 10, 13, 9, 12.5),
    bar(8, 12, 12.5, 10, 11),
  ];

  const result = calculateSmartMoneyConcepts(candles, { internalLength: 1, swingLength: 2 });

  assert.ok(result.internal.events.some((event) =>
    event.side === "high" && event.type === "BOS" && event.time === 7
  ));
  assert.ok(result.orderBlocks.internal.some((block) =>
    block.direction === 1 && block.startTime === 4
  ));
});

test("finds unfilled bullish fair value gaps and prior-period levels", () => {
  const dayStart = 1_700_006_400;
  const candles = [
    bar(dayStart, 6, 8, 5, 7),
    bar(dayStart + 60, 7, 9, 6, 8),
    bar(dayStart + 120, 10, 12, 9, 11),
    bar(dayStart + 86400, 10, 12, 9, 11),
    bar(dayStart + 86460, 11, 13, 10, 12),
  ];

  const result = calculateSmartMoneyConcepts(candles, { internalLength: 1, swingLength: 2 });

  assert.ok(result.fairValueGaps.some((gap) => gap.direction === 1 && gap.bottom === 8 && gap.top === 9));
  assert.deepEqual(result.previousLevels.map((level) => level.label), ["PDH", "PDL"]);
});

test("rejects malformed or out-of-order candle input", () => {
  assert.throws(() => calculateSmartMoneyConcepts(null), /Candles must be an array/);
  assert.throws(() => calculateSmartMoneyConcepts([
    bar(2, 6, 8, 5, 7),
    bar(1, 7, 10, 6, 9),
  ]), /valid and sorted by time/);
  assert.throws(() => calculateSmartMoneyConcepts([], { swingLength: 1 }), /Swing pivot length/);
});
