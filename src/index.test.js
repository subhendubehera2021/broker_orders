import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./index.js";

test("scheduled handler reads auto-trade settings without logging their contents", async () => {
  const messages = [];
  const keysRead = [];
  const originalLog = console.log;
  const originalNow = Date.now;
  console.log = (message) => messages.push(message);
  Date.now = () => Date.UTC(2026, 10, 16, 6, 58, 17);

  try {
    await worker.scheduled(
      {
        cron: "* * * * *",
        scheduledTime: Date.UTC(2026, 10, 16, 6, 58, 15),
      },
      {
        AUTO_TRADE_SETTINGS: {
          async get(key) {
            keysRead.push(key);
            return '{"apiKey":"do-not-log"}';
          },
        },
      },
    );
  } finally {
    console.log = originalLog;
    Date.now = originalNow;
  }

  assert.deepEqual(keysRead, ["auto-trade-settings"]);
  assert.deepEqual(messages, [
    "[nifty-cron] cron=* * * * * scheduledForIST=16/11/2026, 12:28:00 IST startedAtIST=16/11/2026, 12:28:17 IST",
    "[nifty-cron] auto-trade-settings found=true",
  ]);
  assert.equal(messages.some((message) => message.includes("do-not-log")), false);
});

test("scheduled handler reports when auto-trade settings are not in KV", async () => {
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => messages.push(message);

  try {
    await worker.scheduled(
      { cron: "* * * * *", scheduledTime: Date.UTC(2026, 10, 16, 6, 58) },
      { AUTO_TRADE_SETTINGS: { async get() { return null; } } },
    );
  } finally {
    console.log = originalLog;
  }

  assert.equal(messages.at(-1), "[nifty-cron] auto-trade-settings found=false");
});
