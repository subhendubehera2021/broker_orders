import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./index.js";

test("scheduled handler logs the cron and scheduled time in India time", () => {
  const messages = [];
  const originalLog = console.log;
  const originalNow = Date.now;
  console.log = (message) => messages.push(message);
  Date.now = () => Date.UTC(2026, 10, 16, 6, 58, 17);

  try {
    worker.scheduled({
      cron: "* * * * *",
      scheduledTime: Date.UTC(2026, 10, 16, 6, 58, 15),
    });
  } finally {
    console.log = originalLog;
    Date.now = originalNow;
  }

  assert.deepEqual(messages, [
    "[nifty-cron] cron=* * * * * scheduledForIST=16/11/2026, 12:28:00 IST startedAtIST=16/11/2026, 12:28:17 IST",
  ]);
});
