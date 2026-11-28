import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeltaExchangeSignature,
  getDeltaExchangeAuthStatus,
  testDeltaExchangeAuthentication,
} from "../src/deltaexchange/services/deltaexchange-client.js";
import {
  getBtcUsdPerpetualBreakoutsForRange,
  getRecentBtcUsdPerpetualCandles,
} from "../src/deltaexchange/services/market-data.service.js";

test("Delta Exchange signature applies the documented HMAC prehash", () => {
  const signature = createDeltaExchangeSignature(
    "7b6f39dcf660ec1c7c664f612c60410a2bd0c258416b498bf0311f94228f",
    "GET",
    "1542110948",
    "/v2/orders",
    "?product_id=1&state=open",
  );

  // The documented sample hash does not match its sample inputs; this digest was cross-checked with OpenSSL.
  assert.equal(
    signature,
    "4e38dda3e6477092f360ba70399266d8145630b22bcc34c0ec7f804d5746877a",
  );
});

test("auth status reports configuration without returning credentials", () => {
  assert.deepEqual(
    getDeltaExchangeAuthStatus({
      DELTA_EXCHANGE_API_KEY: "private-key",
      DELTA_EXCHANGE_API_SECRET: "private-secret",
    }),
    { configured: true, environment: "production" },
  );
  assert.deepEqual(
    getDeltaExchangeAuthStatus({ DELTA_EXCHANGE_API_KEY: "partial-key" }),
    { configured: false, environment: "production" },
  );
});

test("auth check signs the read-only profile request with the configured server credentials", async () => {
  let requestUrl;
  let requestOptions;
  const result = await testDeltaExchangeAuthentication({
    env: {
      DELTA_EXCHANGE_API_KEY: "test-key",
      DELTA_EXCHANGE_API_SECRET: "test-secret",
    },
    now: 1_542_110_948_000,
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, result: { email: "private@example.test" } }),
      };
    },
  });

  assert.deepEqual(result, { authenticated: true });
  assert.equal(requestUrl, "https://api.india.delta.exchange/v2/profile");
  assert.equal(requestOptions.method, "GET");
  assert.equal(requestOptions.headers["api-key"], "test-key");
  assert.equal(requestOptions.headers.timestamp, "1542110948");
  assert.equal(
    requestOptions.headers.signature,
    createDeltaExchangeSignature(
      "test-secret",
      "GET",
      "1542110948",
      "/v2/profile",
    ),
  );
  assert.equal(requestOptions.headers["User-Agent"], "broker-orders/1.0");
  assert.equal(requestOptions.body, undefined);
});

test("auth check reports missing server credentials", async () => {
  await assert.rejects(
    testDeltaExchangeAuthentication({ env: {} }),
    {
      message: "Set DELTA_EXCHANGE_API_KEY and DELTA_EXCHANGE_API_SECRET in .env.",
      statusCode: 503,
    },
  );
});

test("auth check surfaces a rejected production credential without returning profile data", async () => {
  await assert.rejects(
    testDeltaExchangeAuthentication({
      env: {
        DELTA_EXCHANGE_API_KEY: "test-key",
        DELTA_EXCHANGE_API_SECRET: "test-secret",
      },
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: "invalid_api_key" },
        }),
      }),
    }),
    {
      message: "Delta Exchange authentication failed: invalid_api_key.",
      statusCode: 502,
    },
  );
});

test("fetches the recent candle windows without auth headers", async () => {
  const requestUrls = [];
  let requestOptions;
  const result = await getRecentBtcUsdPerpetualCandles({
    now: 1_700_000_000_000,
    fetchImpl: async (url, options) => {
      requestUrls.push(new URL(url));
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: [{
            time: 1_699_999_940,
            open: 34000,
            high: 34010,
            low: 33990,
            close: 34005,
            volume: 12.5,
          }],
        }),
      };
    },
  });

  assert.equal(requestUrls.length, 3);
  const requestStarts = requestUrls.map((url) => Number(url.searchParams.get("start")));
  const requestEnds = requestUrls.map((url) => Number(url.searchParams.get("end")));
  assert.equal(requestUrls[0].origin, "https://api.india.delta.exchange");
  assert.equal(requestUrls[0].pathname, "/v2/history/candles");
  assert.equal(requestUrls[0].searchParams.get("resolution"), "1m");
  assert.equal(requestUrls[0].searchParams.get("symbol"), "BTCUSD");
  assert.equal(requestStarts[0], 1_700_000_000 - 3 * 24 * 60 * 60 - 5 * 60);
  assert.equal(requestEnds.at(-1), 1_700_000_000);
  assert.deepEqual(requestStarts.slice(1), requestEnds.slice(0, -1));
  assert.deepEqual(requestOptions.headers, { Accept: "application/json" });
  assert.equal(result.symbol, "BTCUSD.P");
  assert.equal(result.apiSymbol, "BTCUSD");
  assert.equal(result.candles.length, 1);
  assert.deepEqual(result.liquiditySwings, { highs: [], lows: [] });
  assert.deepEqual(result.liquidityBreakouts, []);
  assert.deepEqual(result.dailyLiquidityBreakouts, []);
  assert.equal(result.pivotLookback, 5);
});

test("returns all confirmed swing highs and lows from the past 24 hours", async () => {
  const now = 1_700_000_000_000;
  const windowStart = Math.floor(now / 1000) - 24 * 60 * 60;
  const contextStart = windowStart - 5 * 60;
  const highs = [
    100, 101, 102, 103, 104, 120, 110, 109, 108, 107, 106,
    105, 104, 103, 102, 101, 100, 99, 98, 97, 96,
  ];
  const lows = highs.map((high) => high - 3);
  lows[15] = 70;
  const candles = highs.map((high, index) => ({
    time: contextStart + index * 60,
    open: high - 2,
    high,
    low: lows[index],
    close: high - 1,
    volume: index + 1,
  }));
  const result = await getRecentBtcUsdPerpetualCandles({
    now,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: candles }),
    }),
  });

  assert.equal(result.candles.length, 16);
  assert.equal(result.liquiditySwings.highs.length, 1);
  assert.equal(result.liquiditySwings.lows.length, 1);
  assert.deepEqual(
    result.liquiditySwings.highs[0],
    {
      side: "high",
      pivotTime: new Date(windowStart * 1000).toISOString(),
      confirmedAt: new Date((windowStart + 5 * 60) * 1000).toISOString(),
      level: 120,
      zoneTop: 120,
      zoneBottom: 119,
      intersectionCount: 0,
      intersectionVolume: 0,
      pivotVolume: 6,
      status: "tracking",
    },
  );
  assert.deepEqual(
    result.liquiditySwings.lows[0],
    {
      side: "low",
      pivotTime: new Date((windowStart + 10 * 60) * 1000).toISOString(),
      confirmedAt: new Date((windowStart + 15 * 60) * 1000).toISOString(),
      level: 70,
      zoneTop: 99,
      zoneBottom: 70,
      intersectionCount: 0,
      intersectionVolume: 0,
      pivotVolume: 16,
      status: "tracking",
    },
  );
});

test("returns a separate 72-hour breakout series without extending the 24-hour table data", async () => {
  const now = 1_700_000_000_000;
  const breakoutStart = Math.floor(now / 1000) - 3 * 24 * 60 * 60;
  const highs = [100, 101, 102, 103, 104, 120, 110, 109, 108, 107, 106, 121];
  const candles = highs.map((high, index) => ({
    time: breakoutStart + index * 60,
    open: high - 2,
    high,
    low: high - 5,
    close: high - 1,
    volume: 1,
  }));
  const result = await getRecentBtcUsdPerpetualCandles({
    now,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: candles }),
    }),
  });

  assert.equal(result.candles.length, 0);
  assert.deepEqual(result.liquidityBreakouts, []);
  assert.equal(result.dailyLiquidityBreakouts.length, 1);
  assert.equal(result.dailyLiquidityBreakouts[0].side, "high");
  assert.equal(result.dailyLiquidityBreakouts[0].level, 120);
  assert.equal(result.dailyLiquidityBreakouts[0].breakoutTime, breakoutStart + 11 * 60);
});

test("fetches a 30-day breakout range in bounded candle-request batches", async () => {
  const now = 1_700_000_000_000;
  const end = Math.floor(now / 1000);
  const requestUrls = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const result = await getRecentBtcUsdPerpetualCandles({
    now,
    breakoutDays: 30,
    fetchImpl: async (url) => {
      requestUrls.push(new URL(url));
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, result: [] }),
      };
    },
  });

  assert.equal(requestUrls.length, 30);
  assert.equal(maxActiveRequests, 5);
  assert.equal(result.breakoutStart, end - 30 * 24 * 60 * 60);
  assert.equal(result.start, end - 24 * 60 * 60);
  assert.deepEqual(result.dailyLiquidityBreakouts, []);
});

test("rejects unsupported quick breakout ranges before fetching candles", async () => {
  await assert.rejects(
    getRecentBtcUsdPerpetualCandles({
      breakoutDays: 6,
      fetchImpl: async () => {
        throw new Error("The fetcher must not be called for an invalid range.");
      },
    }),
    {
      message: "Breakout range must be 3, 7, 15, or 30 days.",
      statusCode: 400,
    },
  );
});

test("backtests breakouts for a requested historical date", async () => {
  const start = 1_700_000_000;
  const end = start + 24 * 60 * 60;
  const now = end * 1000;
  const highs = [100, 101, 102, 103, 104, 120, 110, 109, 108, 107, 106, 121];
  const candles = highs.map((high, index) => ({
    time: start + index * 60,
    open: high - 2,
    high,
    low: high - 5,
    close: high - 1,
    volume: 1,
  }));
  const requestUrls = [];
  const result = await getBtcUsdPerpetualBreakoutsForRange({
    start,
    end,
    now,
    fetchImpl: async (url) => {
      const requestUrl = new URL(url);
      requestUrls.push(requestUrl);
      const requestStart = Number(requestUrl.searchParams.get("start"));
      const requestEnd = Number(requestUrl.searchParams.get("end"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: candles.filter(
            (candle) => candle.time >= requestStart && candle.time <= requestEnd,
          ),
        }),
      };
    },
  });

  assert.equal(requestUrls.length, 2);
  assert.equal(result.start, start);
  assert.equal(result.end, end);
  assert.equal(result.candles.length, candles.length);
  assert.equal(result.liquidityBreakouts.length, 1);
  assert.equal(result.liquidityBreakouts[0].side, "high");
  assert.equal(result.liquidityBreakouts[0].breakoutTime, start + 11 * 60);
  assert.deepEqual(result.dailyLiquidityBreakouts, result.liquidityBreakouts);
});

test("rejects historical backtest ranges longer than 26 hours", async () => {
  await assert.rejects(
    getBtcUsdPerpetualBreakoutsForRange({
      start: 1_700_000_000,
      end: 1_700_000_000 + 26 * 60 * 60 + 1,
      fetchImpl: async () => {
        throw new Error("The fetcher must not be called for an invalid range.");
      },
    }),
    {
      message: "The requested backtest date range is invalid.",
      statusCode: 400,
    },
  );
});

test("rejects unsuccessful Delta candle responses", async () => {
  await assert.rejects(
    getRecentBtcUsdPerpetualCandles({
      fetchImpl: async () => ({
        ok: false,
        status: 502,
        json: async () => ({
          success: false,
          error: { code: "service_unavailable" },
        }),
      }),
    }),
    {
      message: "Delta Exchange candle request failed: service_unavailable.",
      statusCode: 502,
    },
  );
});
