import assert from "node:assert/strict";
import test from "node:test";
import { aggregateOneMinuteBarsToThreeMinutes } from "../src/auto-trade-process/lib/candle-aggregation.js";

test("aggregates complete three-minute OHLCV bars and omits partial buckets", () => {
  const bars = [
    { timestamp: "2026-01-01T03:45:00.000Z", open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { timestamp: "2026-01-01T03:46:00.000Z", open: 11, high: 14, low: 10, close: 13, volume: 120 },
    { timestamp: "2026-01-01T03:47:00.000Z", open: 13, high: 15, low: 12, close: 14, volume: 140 },
    { timestamp: "2026-01-01T03:48:00.000Z", open: 14, high: 16, low: 13, close: 15, volume: 160 },
    { timestamp: "2026-01-01T03:51:00.000Z", open: 15, high: 18, low: 14, close: 17, volume: 180 },
  ];

  assert.deepEqual(aggregateOneMinuteBarsToThreeMinutes(bars), [
    {
      timestamp: "2026-01-01T03:45:00.000Z",
      open: 10,
      high: 15,
      low: 9,
      close: 14,
      volume: 360,
    },
  ]);
});

test("rejects non-array input and invalid candle timestamps", () => {
  assert.throws(() => aggregateOneMinuteBarsToThreeMinutes(null), {
    message: "Historical candles must be an array",
  });
  assert.throws(() => aggregateOneMinuteBarsToThreeMinutes([{ timestamp: "invalid" }]), {
    message: "Cannot aggregate a candle with an invalid timestamp",
  });
});
