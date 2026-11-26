import assert from "node:assert/strict";
import test from "node:test";
import { calculateOrderBlocks } from "../public/ui/order-blocks.js";

const candles = [
  { time: 0, open: 6, high: 8, low: 5, close: 6 },
  { time: 60, open: 9, high: 10, low: 7, close: 9 },
  { time: 120, open: 8, high: 9, low: 6, close: 8 },
  { time: 180, open: 7, high: 8, low: 4, close: 7 },
  { time: 240, open: 9, high: 12, low: 8, close: 11 },
];

test("detects an internal bullish order block on a confirmed structure break", () => {
  const blocks = calculateOrderBlocks(candles, {
    internalEnabled: true,
    swingEnabled: false,
    internalLength: 2,
    internalCount: 7,
  });

  assert.deepEqual(blocks.internal, [{
    kind: "internal",
    bias: 1,
    time: 180,
    top: 8,
    bottom: 4,
  }]);
  assert.deepEqual(blocks.swing, []);
});

test("detects swing order blocks independently of internal blocks", () => {
  const blocks = calculateOrderBlocks(candles, {
    internalEnabled: false,
    swingEnabled: true,
    swingLength: 2,
    swingCount: 7,
  });

  assert.deepEqual(blocks.internal, []);
  assert.deepEqual(blocks.swing, [{
    kind: "swing",
    bias: 1,
    time: 180,
    top: 8,
    bottom: 4,
  }]);
});
