import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchFyersCandles,
  fetchFyersQuote,
  FyersMarketDataError,
} from "../src/fyers-market-data.js";

test("requests and normalizes Fyers historical candles", async () => {
  let requestUrl;
  const candles = await fetchFyersCandles({
    appId: "test-app-id",
    accessToken: "test-access-token",
    symbol: "NSE:SBIN-EQ",
    resolution: "5",
    rangeFrom: "2026-11-10",
    rangeTo: "2026-11-18",
  }, async (url, options) => {
    requestUrl = url;
    assert.equal(options.headers.Authorization, "test-app-id:test-access-token");
    assert.equal(options.redirect, "manual");
    return Response.json({
      s: "ok",
      candles: [[1794307200, 100, 105, 99, 103, 1200]],
    });
  });

  assert.equal(requestUrl.pathname, "/data/history");
  assert.equal(requestUrl.searchParams.get("symbol"), "NSE:SBIN-EQ");
  assert.equal(requestUrl.searchParams.get("resolution"), "5");
  assert.equal(requestUrl.searchParams.get("date_format"), "1");
  assert.equal(requestUrl.searchParams.get("range_from"), "2026-11-10");
  assert.equal(requestUrl.searchParams.get("range_to"), "2026-11-18");
  assert.deepEqual(candles, [{
    time: 1794307200,
    open: 100,
    high: 105,
    low: 99,
    close: 103,
    volume: 1200,
  }]);
});

test("requests and normalizes a Fyers live quote", async () => {
  let requestUrl;
  const quote = await fetchFyersQuote({
    appId: "test-app-id",
    accessToken: "test-access-token",
    symbol: "NSE:SBIN-EQ",
  }, async (url, options) => {
    requestUrl = url;
    assert.equal(options.headers.Authorization, "test-app-id:test-access-token");
    return Response.json({
      s: "ok",
      d: [{
        n: "NSE:SBIN-EQ",
        s: "ok",
        v: { lp: 103.5, volume: 1200, tt: "1794307200" },
      }],
    });
  });

  assert.equal(requestUrl.pathname, "/data/quotes");
  assert.equal(requestUrl.searchParams.get("symbols"), "NSE:SBIN-EQ");
  assert.deepEqual(quote, {
    symbol: "NSE:SBIN-EQ",
    price: 103.5,
    volume: 1200,
    time: 1794307200,
  });
});

test("rejects malformed symbols and ranges before making a request", async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return Response.json({ s: "ok", candles: [] });
  };
  await assert.rejects(
    fetchFyersCandles({
      appId: "test-app-id",
      accessToken: "test-access-token",
      symbol: "https://example.com",
      resolution: "5",
      rangeFrom: "2026-11-10",
      rangeTo: "2026-11-18",
    }, fetchImpl),
    (error) => error instanceof FyersMarketDataError && error.statusCode === 400,
  );
  await assert.rejects(
    fetchFyersCandles({
      appId: "test-app-id",
      accessToken: "test-access-token",
      symbol: "NSE:SBIN-EQ",
      resolution: "5",
      rangeFrom: "2026-01-01",
      rangeTo: "2026-05-01",
    }, fetchImpl),
    /supports up to 100 days/,
  );
  assert.equal(requests, 0);
});
