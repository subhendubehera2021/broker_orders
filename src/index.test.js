import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./index.js";

test("scheduled handler logs the cron and scheduled time", () => {
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => messages.push(message);

  try {
    worker.scheduled({
      cron: "* * * * *",
      scheduledTime: Date.UTC(2026, 10, 16, 6, 30),
    });
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(messages, [
    "[nifty-cron] cron=* * * * * scheduledAt=2026-11-16T06:30:00.000Z",
  ]);
});
