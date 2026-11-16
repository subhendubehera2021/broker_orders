import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

test("scheduled handler reads Kotak credentials and logs the highest-volume call and put", async () => {
  const messages = [];
  const originalLog = console.log;
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const requests = [];
  console.log = (message) => messages.push(message);
  Date.now = () => Date.UTC(2026, 10, 16, 6, 58, 17);
  globalThis.fetch = async (url, options) => {
    requests.push(url);
    if (url.pathname.endsWith("/option-chain")) {
      assert.equal(options.headers.Authorization, "do-not-log");
      assert.equal(
        url.href,
        "https://cis.kotaksecurities.com/market-data/1.0/watchlist/option-chain?exchange=nse_fo&underlying=NIFTY&instrument_type=option&count=40",
      );
      return Response.json({
        data: {
          call: [{
            instrument: { neoSymbol: "nse_fo|1", symbol: "NIFTY-CALL" },
            quote: { volume: 500 },
          }],
          put: [{
            inst: { neoSymbol: "nse_fo|2", symbol: "NIFTY-PUT" },
            quote: { vol: "600" },
          }],
        },
      });
    }
    assert.equal(url.href, "https://swing.example/api/liquidity-swing");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer swing-secret");
    assert.deepEqual(JSON.parse(options.body), {
      instruments: [
        { optionSide: "CALL", token: "nse_fo|1" },
        { optionSide: "PUT", token: "nse_fo|2" },
      ],
    });
    return Response.json({
      analyses: [
        {
          optionSide: "CALL",
          token: "nse_fo|1",
          interval: "1min",
          pivotLookback: 5,
          swing: null,
        },
        {
          optionSide: "PUT",
          token: "nse_fo|2",
          interval: "1min",
          pivotLookback: 5,
          swing: null,
        },
      ],
    });
  };

  try {
    await worker.scheduled(
      {
        cron: "* * * * *",
        scheduledTime: Date.UTC(2026, 10, 16, 6, 58, 15),
      },
      {
        KOTAK_NEO_API_TOKEN: "do-not-log",
        KOTAK_NEO_BASE_URL: "https://cis.kotaksecurities.com",
        SWING_API_URL: "https://swing.example/api/liquidity-swing",
        SWING_API_SECRET: "swing-secret",
      },
    );
  } finally {
    console.log = originalLog;
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((url) => url.pathname),
    ["/market-data/1.0/watchlist/option-chain", "/api/liquidity-swing"],
  );
  assert.equal(
    messages[0],
    "[nifty-cron] cron=* * * * * scheduledForIST=16/11/2026, 12:28:00 IST startedAtIST=16/11/2026, 12:28:17 IST",
  );
  assert.equal(messages.length, 2);
  assert.match(messages[1], /^\[nifty-cron\] liquidity-swings\n\+/);
  assert.match(messages[1], /SIDE\s+\| SYMBOL\s+\| TOKEN\s+\| OPTION VOL/);
  assert.match(messages[1], /CALL\s+\| NIFTY-CALL\s+\| nse_fo\|1\s+\| 500/);
  assert.match(messages[1], /PUT\s+\| NIFTY-PUT\s+\| nse_fo\|2\s+\| 600/);
  assert.match(messages[1], /not-found/);
  assert.equal(messages.some((message) => message.includes("do-not-log")), false);
  assert.equal(messages.some((message) => message.includes("swing-secret")), false);
});
