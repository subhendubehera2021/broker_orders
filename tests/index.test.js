import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

test("scheduled handler reads Kotak credentials and logs the highest-volume call and put", async () => {
  const messages = [];
  const keysRead = [];
  const originalLog = console.log;
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const requests = [];
  console.log = (message) => messages.push(message);
  Date.now = () => Date.UTC(2026, 10, 16, 6, 58, 17);
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "do-not-log");
    requests.push(url);
    if (url.pathname.endsWith("/option-chain")) {
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
    assert.equal(url.pathname.endsWith("/historical/details"), true);
    return Response.json({ status: "success", data: { candles: [] } });
  };

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
            return key === "kotak-neo-api-token"
              ? "do-not-log"
              : "https://cis.kotaksecurities.com";
          },
        },
      },
    );
  } finally {
    console.log = originalLog;
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(keysRead, ["kotak-neo-api-token", "kotak-neo-base-url"]);
  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map((url) => url.searchParams.get("neosymbol")),
    [null, "nse_fo|1", "nse_fo|2"],
  );
  assert.deepEqual(messages, [
    "[nifty-cron] cron=* * * * * scheduledForIST=16/11/2026, 12:28:00 IST startedAtIST=16/11/2026, 12:28:17 IST",
    "[nifty-cron] highest-volume-call symbol=NIFTY-CALL token=nse_fo|1 volume=500",
    "[nifty-cron] highest-volume-put symbol=NIFTY-PUT token=nse_fo|2 volume=600",
    "[nifty-cron] liquidity-swing optionSide=CALL symbol=NIFTY-CALL swingSide=HIGH status=not-found candles=0",
    "[nifty-cron] liquidity-swing optionSide=CALL symbol=NIFTY-CALL swingSide=LOW status=not-found candles=0",
    "[nifty-cron] liquidity-swing optionSide=PUT symbol=NIFTY-PUT swingSide=HIGH status=not-found candles=0",
    "[nifty-cron] liquidity-swing optionSide=PUT symbol=NIFTY-PUT swingSide=LOW status=not-found candles=0",
  ]);
  assert.equal(messages.some((message) => message.includes("do-not-log")), false);
});
