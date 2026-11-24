import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchFyersCandles,
  fetchFyersOptionChain,
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

test("sorts historical candles and keeps one value per timestamp", async () => {
  const candles = await fetchFyersCandles({
    appId: "test-app-id",
    accessToken: "test-access-token",
    symbol: "NSE:SBIN-EQ",
    resolution: "5",
    rangeFrom: "2026-11-10",
    rangeTo: "2026-11-18",
  }, async () => Response.json({
    s: "ok",
    candles: [
      [1794307500, 103, 107, 102, 106, 1500],
      [1794307200, 100, 105, 99, 103, 1200],
      [1794307500, 103, 108, 102, 107, 1600],
    ],
  }));

  assert.deepEqual(candles, [
    { time: 1794307200, open: 100, high: 105, low: 99, close: 103, volume: 1200 },
    { time: 1794307500, open: 103, high: 108, low: 102, close: 107, volume: 1600 },
  ]);
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

test("accepts a live quote without volume when the market is inactive", async () => {
  const quote = await fetchFyersQuote({
    appId: "test-app-id",
    accessToken: "test-access-token",
    symbol: "NSE:SBIN-EQ",
  }, async () => Response.json({
    s: "ok",
    d: [{
      n: "NSE:SBIN-EQ",
      s: "ok",
      v: { lp: 103.5, tt: "1794307200", volume: null },
    }],
  }));

  assert.deepEqual(quote, {
    symbol: "NSE:SBIN-EQ",
    price: 103.5,
    time: 1794307200,
    volume: undefined,
  });
});

test("rejects null candle and quote values instead of coercing them to zero", async () => {
  const fetchImpl = async (url) => new URL(url).pathname.endsWith("/history")
    ? Response.json({ s: "ok", candles: [[1794307200, null, 105, 99, 103, 1200]] })
    : Response.json({
        s: "ok",
        d: [{ n: "NSE:SBIN-EQ", s: "ok", v: { lp: null, volume: 1300, tt: "1794307500" } }],
      });

  await assert.rejects(
    fetchFyersCandles({
      appId: "test-app-id",
      accessToken: "test-access-token",
      symbol: "NSE:SBIN-EQ",
      resolution: "5",
      rangeFrom: "2026-11-10",
      rangeTo: "2026-11-18",
    }, fetchImpl),
    (error) => error instanceof FyersMarketDataError && error.statusCode === 502,
  );
  await assert.rejects(
    fetchFyersQuote({
      appId: "test-app-id",
      accessToken: "test-access-token",
      symbol: "NSE:SBIN-EQ",
    }, fetchImpl),
    (error) => error instanceof FyersMarketDataError && error.statusCode === 502,
  );
});

test("requests and normalizes the Fyers NIFTY option chain", async () => {
  let requestUrl;
  const optionChain = await fetchFyersOptionChain({
    appId: "test-app-id",
    accessToken: "test-access-token",
    strikeCount: 1,
    timestamp: "1795300000",
  }, async (url, options) => {
    requestUrl = url;
    assert.equal(options.headers.Authorization, "test-app-id:test-access-token");
    return Response.json({
      s: "ok",
      data: {
        callOi: 1200,
        putOi: 1400,
        expiryData: [{ date: "26-11-2026", expiry: "1795300000" }],
        optionsChain: [
          { symbol: "NSE:NIFTY50-INDEX", option_type: "", strike_price: -1, ltp: 24600 },
          {
            symbol: "NSE:NIFTY26NOV24600CE",
            option_type: "CE",
            strike_price: 24600,
            ltp: 210,
            ltpch: 5,
            ltpchp: 2.44,
            oi: 500,
            oich: 20,
            volume: 1000,
            bid: 209.5,
            ask: 210.5,
          },
          {
            symbol: "NSE:NIFTY26NOV24600PE",
            option_type: "PE",
            strike_price: 24600,
            ltp: 180,
            oi: 700,
          },
        ],
      },
    });
  });

  assert.equal(requestUrl.pathname, "/data/options-chain-v3");
  assert.equal(requestUrl.searchParams.get("symbol"), "NSE:NIFTY50-INDEX");
  assert.equal(requestUrl.searchParams.get("strikecount"), "1");
  assert.equal(requestUrl.searchParams.get("timestamp"), "1795300000");
  assert.equal(requestUrl.searchParams.get("greeks"), "1");
  assert.deepEqual(optionChain, {
    symbol: "NSE:NIFTY50-INDEX",
    underlyingPrice: 24600,
    callOpenInterest: 1200,
    putOpenInterest: 1400,
    expiries: [{ date: "26-11-2026", timestamp: "1795300000" }],
    options: [
      {
        symbol: "NSE:NIFTY26NOV24600CE",
        optionType: "CE",
        strikePrice: 24600,
        ltp: 210,
        ltpChange: 5,
        ltpChangePercent: 2.44,
        openInterest: 500,
        openInterestChange: 20,
        volume: 1000,
        bid: 209.5,
        ask: 210.5,
      },
      {
        symbol: "NSE:NIFTY26NOV24600PE",
        optionType: "PE",
        strikePrice: 24600,
        ltp: 180,
        ltpChange: undefined,
        ltpChangePercent: undefined,
        openInterest: 700,
        openInterestChange: undefined,
        volume: undefined,
        bid: undefined,
        ask: undefined,
      },
    ],
  });
});

test("requests Crude Oil option chains and uses the futures price as the reference", async () => {
  let requestUrl;
  const optionChain = await fetchFyersOptionChain({
    appId: "test-app-id",
    accessToken: "test-access-token",
    symbol: "MCX:CRUDEOIL-INDEX",
    strikeCount: 2,
  }, async (url, options) => {
    requestUrl = url;
    assert.equal(options.headers.Authorization, "test-app-id:test-access-token");
    return Response.json({
      s: "ok",
      data: {
        expiryData: [{ date: "19-12-2026", expiry: "1797681600" }],
        optionsChain: [
          { symbol: "MCX:CRUDEOIL-INDEX", option_type: "", strike_price: -1, ltp: 5200, fp: 5225 },
          { symbol: "MCX:CRUDEOIL26DEC5225CE", option_type: "CE", strike_price: 5225, ltp: 120 },
          { symbol: "MCX:CRUDEOIL26DEC5225PE", option_type: "PE", strike_price: 5225, ltp: 105 },
        ],
      },
    });
  });

  assert.equal(requestUrl.searchParams.get("symbol"), "MCX:CRUDEOIL-INDEX");
  assert.equal(optionChain.symbol, "MCX:CRUDEOIL-INDEX");
  assert.equal(optionChain.underlyingPrice, 5225);
  assert.deepEqual(optionChain.expiries, [{ date: "19-12-2026", timestamp: "1797681600" }]);
  assert.deepEqual(optionChain.options.map(({ symbol, optionType, strikePrice }) => ({
    symbol,
    optionType,
    strikePrice,
  })), [
    { symbol: "MCX:CRUDEOIL26DEC5225CE", optionType: "CE", strikePrice: 5225 },
    { symbol: "MCX:CRUDEOIL26DEC5225PE", optionType: "PE", strikePrice: 5225 },
  ]);
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
  await assert.rejects(
    fetchFyersOptionChain({
      appId: "test-app-id",
      accessToken: "test-access-token",
      strikeCount: 51,
    }, fetchImpl),
    (error) => error instanceof FyersMarketDataError && error.statusCode === 400,
  );
  await assert.rejects(
    fetchFyersOptionChain({
      appId: "test-app-id",
      accessToken: "test-access-token",
      symbol: "MCX:GOLD-INDEX",
    }, fetchImpl),
    (error) => error instanceof FyersMarketDataError && error.statusCode === 400,
  );
  assert.equal(requests, 0);
});
