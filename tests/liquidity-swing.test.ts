import assert from "node:assert/strict";
import test from "node:test";
import {
  findLatestLiquiditySwingHigh,
  findLiquiditySwings,
} from "../src/liquidity-swing-v2/swing-logic.js";

test("finds the latest confirmed swing-high zone and qualifies an intersection", () => {
  const bars = [
    { timestamp: "2025-01-04T00:00:00Z", open: 8.5, high: 9.5, low: 8, close: 9, volume: 4 },
    { timestamp: "2025-01-02T00:00:00Z", open: 9, high: 10, low: 8, close: 9, volume: 2 },
    { timestamp: "2025-01-01T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 1 },
    { timestamp: "2025-01-03T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 3 },
  ];

  const swing = findLatestLiquiditySwingHigh(bars, { pivotLookback: 1 });

  assert.equal(swing?.pivotTime, "2025-01-02T00:00:00Z");
  assert.equal(swing?.confirmedAt, "2025-01-03T00:00:00Z");
  assert.equal(swing?.zoneTop, 10);
  assert.equal(swing?.zoneBottom, 9);
  assert.equal(swing?.intersectionCount, 1);
  assert.equal(swing?.intersectionVolume, 4);
  assert.equal(swing?.status, "qualified");
});

test("marks the swing-high zone broken at the first close above its level", () => {
  const bars = [
    { timestamp: "2025-01-01T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 1 },
    { timestamp: "2025-01-02T00:00:00Z", open: 9, high: 10, low: 8, close: 9, volume: 2 },
    { timestamp: "2025-01-03T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 3 },
    { timestamp: "2025-01-04T00:00:00Z", open: 8.5, high: 9.5, low: 8, close: 9, volume: 4 },
    { timestamp: "2025-01-05T00:00:00Z", open: 10.5, high: 11, low: 10, close: 11, volume: 5 },
  ];

  const swing = findLatestLiquiditySwingHigh(bars, { pivotLookback: 1 });

  assert.equal(swing?.status, "broken");
  assert.equal(swing?.brokenAt, "2025-01-05T00:00:00Z");
});

test("returns every historical swing high rather than only the newest one", () => {
  const bars = [
    { timestamp: "2025-01-01T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 1 },
    { timestamp: "2025-01-02T00:00:00Z", open: 9, high: 10, low: 7, close: 9, volume: 2 },
    { timestamp: "2025-01-03T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 3 },
    { timestamp: "2025-01-04T00:00:00Z", open: 10, high: 11, low: 7, close: 10, volume: 4 },
    { timestamp: "2025-01-05T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 5 },
  ];

  const result = findLiquiditySwings(bars, { pivotLookback: 1 });

  assert.equal(result.highs.length, 2);
  assert.deepEqual(result.highs.map((swing) => swing.pivotTime), [
    "2025-01-02T00:00:00Z",
    "2025-01-04T00:00:00Z",
  ]);
});

test("ends an unbroken swing line at the next same-side swing", () => {
  const bars = [
    { timestamp: "2025-01-01T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 1 },
    { timestamp: "2025-01-02T00:00:00Z", open: 9, high: 10, low: 8, close: 9, volume: 2 },
    { timestamp: "2025-01-03T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 3 },
    { timestamp: "2025-01-04T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 4 },
    { timestamp: "2025-01-05T00:00:00Z", open: 9, high: 12, low: 8, close: 9.5, volume: 5 },
    { timestamp: "2025-01-06T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 6 },
    { timestamp: "2025-01-07T00:00:00Z", open: 10, high: 11, low: 8, close: 10.5, volume: 7 },
    { timestamp: "2025-01-08T00:00:00Z", open: 10, high: 13, low: 7, close: 10.5, volume: 8 },
    { timestamp: "2025-01-09T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 9 },
  ];

  const firstSwing = findLiquiditySwings(bars, { pivotLookback: 1 }).highs[0];

  assert.equal(firstSwing?.pivotIndex, 1);
  assert.equal(firstSwing?.lineEndIndex, 4);
  assert.equal(firstSwing?.status, "qualified");
  assert.equal(firstSwing?.brokenAt, undefined);
});

test("finds low swings and applies the full-range area option", () => {
  const bars = [
    { timestamp: "2025-01-01T00:00:00Z", open: 12, high: 13, low: 11, close: 12, volume: 1 },
    { timestamp: "2025-01-02T00:00:00Z", open: 11, high: 12, low: 10, close: 10.5, volume: 2 },
    { timestamp: "2025-01-03T00:00:00Z", open: 12, high: 13, low: 11, close: 12, volume: 3 },
    { timestamp: "2025-01-04T00:00:00Z", open: 10.4, high: 11, low: 10.2, close: 10.5, volume: 4 },
  ];

  const wickSwing = findLiquiditySwings(bars, { pivotLookback: 1 }).lows[0];
  const fullSwing = findLiquiditySwings(bars, {
    pivotLookback: 1,
    area: "full",
  }).lows[0];

  assert.equal(wickSwing?.zoneTop, 10.5);
  assert.equal(wickSwing?.zoneBottom, 10);
  assert.equal(wickSwing?.qualified, true);
  assert.equal(fullSwing?.zoneTop, 12);
  assert.equal(fullSwing?.zoneBottom, 10);
});

test("uses intersecting lower-timeframe volume when intrabar precision is enabled", () => {
  const bars = [
    { timestamp: "2025-01-01T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 1 },
    { timestamp: "2025-01-02T00:00:00Z", open: 9, high: 10, low: 8, close: 9, volume: 2 },
    { timestamp: "2025-01-03T00:00:00Z", open: 8, high: 9, low: 7, close: 8, volume: 3 },
    { timestamp: "2025-01-04T00:00:00Z", open: 8.5, high: 9.5, low: 8, close: 9, volume: 4 },
  ];
  const intrabarBars = [
    { timestamp: "2025-01-04T00:01:00Z", open: 8.5, high: 9.5, low: 8.5, close: 9, volume: 30 },
    { timestamp: "2025-01-04T00:02:00Z", open: 8, high: 8.5, low: 7.5, close: 8, volume: 50 },
  ];

  const swing = findLiquiditySwings(bars, {
    pivotLookback: 1,
    filterBy: "volume",
    filterValue: 25,
    intrabarPrecision: true,
    intrabarBars,
  }).highs[0];

  assert.equal(swing?.intersectionCount, 1);
  assert.equal(swing?.intersectionVolume, 30);
  assert.equal(swing?.qualified, true);
});
