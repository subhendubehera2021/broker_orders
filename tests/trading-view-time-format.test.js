import assert from "node:assert/strict";
import { test } from "node:test";
import { formatIndiaAxisTick, formatIndiaTime } from "../trading-view/time-format.js";

test("formats time-axis labels in India Standard Time", () => {
  const timestamp = Date.parse("2026-11-18T09:15:00Z") / 1000;

  assert.equal(formatIndiaAxisTick(timestamp, "time"), "14:45");
  assert.equal(formatIndiaTime(timestamp), "14:45");
});

test("formats date-axis ticks using the India calendar date", () => {
  const timestamp = Date.parse("2026-11-18T20:00:00Z") / 1000;

  assert.equal(formatIndiaAxisTick(timestamp, "day"), "19");
  assert.equal(formatIndiaAxisTick(timestamp, "month"), "Nov");
});
