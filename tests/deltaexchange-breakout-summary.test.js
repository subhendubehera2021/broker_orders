import assert from "node:assert/strict";
import test from "node:test";
import { getBreakoutMoveAnalysis } from "../public/ui/deltaexchange-breakout-summary.js";

test("returns breakouts within the requested range with favorable-move and stop-risk percentages", () => {
  const events = [
    {
      side: "high",
      breakoutTime: Date.parse("2026-11-28T04:00:00Z") / 1000,
      level: 10,
      breakoutExtreme: 20,
      stopLoss: 7,
      maxFavorablePoints: 5,
      stopHitAt: null,
    },
    {
      side: "high",
      breakoutTime: Date.parse("2026-11-28T05:00:00Z") / 1000,
      level: 20,
      breakoutExtreme: 21,
      stopLoss: 18,
      maxFavorablePoints: 2,
      stopHitAt: 1_795_842_000,
    },
    {
      side: "low",
      breakoutTime: Date.parse("2026-11-28T06:00:00Z") / 1000,
      level: 20,
      breakoutExtreme: 16,
      stopLoss: 23,
      maxFavorablePoints: 6,
      stopHitAt: null,
    },
    {
      side: "low",
      breakoutTime: Date.parse("2026-11-27T17:00:00Z") / 1000,
      level: 20,
      breakoutExtreme: 10,
      stopLoss: 25,
      maxFavorablePoints: 10,
      stopHitAt: null,
    },
    {
      side: "high",
      breakoutTime: Date.parse("2026-11-25T07:59:59Z") / 1000,
      level: 20,
      breakoutExtreme: 21,
      stopLoss: 18,
      maxFavorablePoints: 2,
      stopHitAt: null,
    },
    {
      side: "low",
      breakoutTime: Date.parse("2026-11-28T09:00:00Z") / 1000,
      level: 20,
      breakoutExtreme: 16,
      stopLoss: 23,
      maxFavorablePoints: 6,
      stopHitAt: null,
    },
  ];

  assert.deepEqual(
    getBreakoutMoveAnalysis(events, {
      startTime: Date.parse("2026-11-25T08:00:00Z") / 1000,
      endTime: Date.parse("2026-11-28T08:00:00Z") / 1000,
    }),
    [
      {
        ...events[3],
        favorablePercent: 50,
        stopRiskPercent: 25,
      },
      {
        ...events[0],
        favorablePercent: 100,
        stopRiskPercent: 30,
      },
      {
        ...events[1],
        favorablePercent: 10,
        stopRiskPercent: 10,
      },
      {
        ...events[2],
        favorablePercent: 30,
        stopRiskPercent: 15,
      },
    ],
  );
});

test("filters to a selected calendar-day range", () => {
  const startTime = Date.parse("2026-11-27T18:30:00Z") / 1000;
  const endTime = Date.parse("2026-11-28T18:30:00Z") / 1000;
  const event = {
    side: "low",
    breakoutTime: startTime,
    level: 20,
    breakoutExtreme: 16,
    stopLoss: 23,
    maxFavorablePoints: 6,
    stopHitAt: null,
  };
  const events = [
    { ...event, breakoutTime: startTime - 1 },
    event,
    { ...event, breakoutTime: endTime },
  ];

  assert.deepEqual(
    getBreakoutMoveAnalysis(events, { startTime, endTime }),
    [{
      ...event,
      favorablePercent: 30,
      stopRiskPercent: 15,
    }],
  );
});
