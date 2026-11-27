import assert from "node:assert/strict";
import test from "node:test";
import { mapFyersCandles } from "../public/ui/chart-data.js";

test("chart candles are sorted and repeated timestamps keep the latest row", () => {
  const rows = [
    [120, 10, 12, 9, 11, 100],
    [60, 8, 10, 7, 9, 50],
    [120, 11, 13, 10, 12, 150],
  ];

  assert.deepEqual(mapFyersCandles(rows), [
    { time: 60, open: 8, high: 10, low: 7, close: 9, volume: 50 },
    { time: 120, open: 11, high: 13, low: 10, close: 12, volume: 150 },
  ]);
});

test("chart candles reject null price and volume values", () => {
  assert.throws(
    () => mapFyersCandles([[60, 8, 10, 7, null, 50]]),
    /invalid candle at row 1/,
  );
});
