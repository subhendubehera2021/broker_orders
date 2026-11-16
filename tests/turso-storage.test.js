import assert from "node:assert/strict";
import { test } from "node:test";
import { persistSwingAnalyses } from "../src/turso-storage.js";

test("persists both option results in one Turso write batch", async () => {
  const batches = [];
  const client = {
    async batch(statements, mode) {
      batches.push({ statements, mode });
    },
  };
  const analyses = [
    {
      optionSide: "CALL",
      token: "nse_fo|1",
      interval: "1min",
      pivotLookback: 5,
      bars: 0,
      swing: null,
    },
    {
      optionSide: "PUT",
      token: "nse_fo|2",
      interval: "1min",
      pivotLookback: 5,
      bars: 10,
      swing: {
        level: 250,
        zoneBottom: 245,
        zoneTop: 250,
        pivotTime: "2026-11-16T10:00:00.000Z",
        confirmedAt: "2026-11-16T10:05:00.000Z",
        intersectionCount: 2,
        intersectionVolume: 300,
        status: "qualified",
      },
    },
  ];

  const scanId = await persistSwingAnalyses(analyses, client);

  assert.match(scanId, /^[0-9a-f-]{36}$/);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].mode, "write");
  assert.equal(batches[0].statements.length, 2);
  assert.deepEqual(batches[0].statements.map(({ args }) => args), [
    [
      scanId,
      "CALL",
      "nse_fo|1",
      "1min",
      5,
      0,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "not-found",
      null,
    ],
    [
      scanId,
      "PUT",
      "nse_fo|2",
      "1min",
      5,
      10,
      1,
      250,
      245,
      250,
      "2026-11-16T10:00:00.000Z",
      "2026-11-16T10:05:00.000Z",
      2,
      300,
      "qualified",
      null,
    ],
  ]);
});
