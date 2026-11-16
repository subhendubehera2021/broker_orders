import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

test("scheduled handler only logs the cron demo timestamp", async () => {
  const messages = [];
  const originalLog = console.log;
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  let now = Date.UTC(2026, 10, 16, 6, 58, 1);
  let delay;
  console.log = (message) => messages.push(message);
  Date.now = () => now;
  globalThis.setTimeout = (callback, waitMs) => {
    delay = waitMs;
    now += waitMs;
    callback();
    return 0;
  };

  try {
    await worker.scheduled(
      {
        cron: "* * * * *",
        scheduledTime: Date.UTC(2026, 10, 16, 6, 58, 0),
      },
    );
  } finally {
    console.log = originalLog;
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.equal(delay, 58_000);
  assert.deepEqual(messages, [
    "[nifty-cron] cron=* * * * * scheduledForIST=16/11/2026, 12:28:59 IST startedAtIST=16/11/2026, 12:28:59 IST",
  ]);
});
