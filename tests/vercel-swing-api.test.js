import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import Fastify from "fastify";
import { registerSwingApiRoutes } from "../src/swing-api-app.js";

const app = Fastify({ bodyLimit: 1_024 });
let persistedAnalyses;
let persistedOptionChain;
let dbClientCalls = 0;
let fyersAuthRequest;
registerSwingApiRoutes(app, {
  createDbClient: () => {
    dbClientCalls += 1;
    return {};
  },
  persistAnalyses: async (analyses) => {
    persistedAnalyses = analyses;
    return { scanId: "test-scan-id", insertedRows: 2 };
  },
  persistOptionChain: async (instruments) => {
    persistedOptionChain = instruments;
  },
});

after(async () => {
  await app.close();
});

test("GET swing API requires its shared secret before requesting Kotak data", async () => {
  const previousSecret = process.env.SWING_API_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.SWING_API_SECRET = "shared-secret";
  globalThis.fetch = async () => {
    throw new Error("Kotak should not be requested");
  };

  let response;
  try {
    response = await app.inject({
      method: "GET",
      url: "/api/liquidity-swing",
      headers: { authorization: "Bearer wrong-secret" },
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.SWING_API_SECRET;
    else process.env.SWING_API_SECRET = previousSecret;
  }

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "Unauthorized" });
  assert.equal(response.headers["cache-control"], "no-store");
});

test("GET swing API selects highest-volume options, analyzes, then persists both sides", async () => {
  const previousEnv = {
    SWING_API_SECRET: process.env.SWING_API_SECRET,
    KOTAK_NEO_API_TOKEN: process.env.KOTAK_NEO_API_TOKEN,
    KOTAK_NEO_BASE_URL: process.env.KOTAK_NEO_BASE_URL,
    NIFTY_OPTION_CHAIN_COUNT: process.env.NIFTY_OPTION_CHAIN_COUNT,
  };
  const originalFetch = globalThis.fetch;
  const requestedTokens = [];
  Object.assign(process.env, {
    SWING_API_SECRET: "shared-secret",
    KOTAK_NEO_API_TOKEN: "dashboard-token",
    KOTAK_NEO_BASE_URL: "https://cis.kotaksecurities.com",
    NIFTY_OPTION_CHAIN_COUNT: "10",
  });
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/api/orders/buy-sl-limit")) {
      return Response.json({ stat: "Ok", nOrdNo: "order-123" });
    }
    assert.equal(options.headers.Authorization, "dashboard-token");
    if (new URL(url).pathname.endsWith("/option-chain")) {
      assert.equal(new URL(url).searchParams.get("count"), "10");
      return Response.json({
        data: {
          call: [
            {
              instrument: {
                neoSymbol: "nse_fo|1",
                symbol: "NIFTY-CE-LOW",
                optionType: "CE",
              },
              quote: { volume: 100 },
            },
            {
              instrument: {
                neoSymbol: "nse_fo|2",
                symbol: "NIFTY-CE-HIGH",
                optionType: "CE",
              },
              quote: { volume: "900" },
            },
          ],
          put: [
            {
              inst: {
                neoSymbol: "nse_fo|3",
                symbol: "NIFTY-PE-HIGH",
                optType: "PE",
              },
              quote: { vol: "1200" },
            },
          ],
        },
      });
    }

    requestedTokens.push(new URL(url).searchParams.get("neosymbol"));
    return Response.json({ status: "success", data: { candles: [] } });
  };

  let response;
  try {
    response = await app.inject({
      method: "GET",
      url: "/api/liquidity-swing",
      headers: { authorization: "Bearer shared-secret" },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const result = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(result.scanId, "test-scan-id");
  assert.equal(result.insertedRows, 2);
  assert.deepEqual(result.selected, {
    call: {
      optionType: "CE",
      symbol: "NIFTY-CE-HIGH",
      token: "nse_fo|2",
      volume: 900,
    },
    put: {
      optionType: "PE",
      symbol: "NIFTY-PE-HIGH",
      token: "nse_fo|3",
      volume: 1200,
    },
  });
  assert.deepEqual(requestedTokens, ["nse_fo|2", "nse_fo|3"]);
  assert.deepEqual(result.analyses, [
    {
      optionSide: "CALL",
      symbol: "NIFTY-CE-HIGH",
      token: "nse_fo|2",
      optionVolume: 900,
      interval: "1min",
      pivotLookback: 5,
      bars: 0,
      swing: null,
      orderResult: null,
    },
    {
      optionSide: "PUT",
      symbol: "NIFTY-PE-HIGH",
      token: "nse_fo|3",
      optionVolume: 1200,
      interval: "1min",
      pivotLookback: 5,
      bars: 0,
      swing: null,
      orderResult: null,
    },
  ]);
  assert.deepEqual(persistedAnalyses, result.analyses);
});

test("GET option-chain API updates the latest CE and PE records", async () => {
  const previousEnv = {
    SWING_API_SECRET: process.env.SWING_API_SECRET,
    KOTAK_NEO_API_TOKEN: process.env.KOTAK_NEO_API_TOKEN,
    KOTAK_NEO_BASE_URL: process.env.KOTAK_NEO_BASE_URL,
    NIFTY_OPTION_CHAIN_COUNT: process.env.NIFTY_OPTION_CHAIN_COUNT,
  };
  const originalFetch = globalThis.fetch;
  const originalPersistedAnalyses = persistedAnalyses;
  const originalPersistedOptionChain = persistedOptionChain;
  const dbClientCallsBefore = dbClientCalls;
  let requests = 0;
  Object.assign(process.env, {
    SWING_API_SECRET: "shared-secret",
    KOTAK_NEO_API_TOKEN: "dashboard-token",
    KOTAK_NEO_BASE_URL: "https://cis.kotaksecurities.com",
    NIFTY_OPTION_CHAIN_COUNT: "10",
  });
  globalThis.fetch = async (url, options) => {
    requests += 1;
    const parsedUrl = new URL(url);
    assert.equal(parsedUrl.pathname, "/market-data/1.0/watchlist/option-chain");
    assert.equal(parsedUrl.searchParams.get("count"), "10");
    assert.equal(options.headers.Authorization, "dashboard-token");
    assert.equal(options.redirect, "manual");
    return Response.json({
      call: [
        {
          instrument: { neoSymbol: "nse_fo|1", symbol: "NIFTY-CE-LOW" },
          quote: { volume: 100 },
        },
        {
          instrument: { neoSymbol: "nse_fo|2", symbol: "NIFTY-CE-HIGH" },
          quote: { volume: 900 },
        },
      ],
      put: [
        {
          instrument: { neoSymbol: "nse_fo|3", symbol: "NIFTY-PE-HIGH" },
          quote: { volume: 1200 },
        },
      ],
    });
  };

  let response;
  try {
    response = await app.inject({
      method: "GET",
      url: "/api/nifty-option-chain",
      headers: { authorization: "Bearer shared-secret" },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    call: {
      optionType: "CE",
      symbol: "NIFTY-CE-HIGH",
      token: "nse_fo|2",
      volume: 900,
    },
    put: {
      optionType: "PE",
      symbol: "NIFTY-PE-HIGH",
      token: "nse_fo|3",
      volume: 1200,
    },
  });
  assert.equal(requests, 1);
  assert.equal(dbClientCalls, dbClientCallsBefore + 1);
  assert.equal(persistedAnalyses, originalPersistedAnalyses);
  assert.deepEqual(persistedOptionChain, response.json());
  persistedOptionChain = originalPersistedOptionChain;
});

test("GET swing API rejects other methods", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/liquidity-swing",
  });

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "GET");
});

test("Fyers login page serves OAuth controls without exposing credentials", async () => {
  const response = await app.inject({ method: "GET", url: "/fyers-login" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/html/);
  assert.match(response.body, /Connect your Fyers account/);
  assert.match(response.body, /href="\/auth\/fyers\/login"/);
  assert.match(response.body, /api\/fyers\/session/);
  assert.doesNotMatch(response.body, /private-fyers-access-token/);
});

test("Fyers OAuth validates state and issues an encrypted session cookie", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnv = {
    FYERS_APP_ID: process.env.FYERS_APP_ID,
    FYERS_APP_SECRET: process.env.FYERS_APP_SECRET,
    FYERS_REDIRECT_URI: process.env.FYERS_REDIRECT_URI,
  };
  Object.assign(process.env, {
    FYERS_APP_ID: "test-app-id",
    FYERS_APP_SECRET: "test-app-secret",
    FYERS_REDIRECT_URI: "http://127.0.0.1:3000/auth/fyers/callback",
  });
  globalThis.fetch = async (url, options) => {
    const requestUrl = new URL(url);
    if (requestUrl.pathname.endsWith("/validate-authcode")) {
      fyersAuthRequest = { url: String(url), options };
      return Response.json({ s: "ok", access_token: "private-fyers-access-token" });
    }
    if (requestUrl.pathname.endsWith("/history")) {
      fyersAuthRequest = { url: String(url), options };
      return Response.json({
        s: "ok",
        candles: [[1794307200, 100, 105, 99, 103, 1200]],
      });
    }
    if (requestUrl.pathname.endsWith("/quotes")) {
      fyersAuthRequest = { url: String(url), options };
      return Response.json({
        s: "ok",
        d: [{ n: "NSE:SBIN-EQ", s: "ok", v: { lp: 104, volume: 1300, tt: "1794307500" } }],
      });
    }
    if (requestUrl.pathname.endsWith("/options-chain-v3")) {
      fyersAuthRequest = { url: String(url), options };
      return Response.json({
        s: "ok",
        data: {
          callOi: 1200,
          putOi: 1400,
          expiryData: [{ date: "26-11-2026", expiry: "1795300000" }],
          optionsChain: [
            { symbol: "NSE:NIFTY50-INDEX", option_type: "", strike_price: -1, ltp: 24600 },
            { symbol: "NSE:NIFTY26NOV24600CE", option_type: "CE", strike_price: 24600, ltp: 210, oi: 500 },
            { symbol: "NSE:NIFTY26NOV24600PE", option_type: "PE", strike_price: 24600, ltp: 180, oi: 700 },
          ],
        },
      });
    }
    throw new Error(`Unexpected Fyers API request: ${requestUrl.pathname}`);
  };

  let login;
  try {
    const initialSession = await app.inject({ method: "GET", url: "/api/fyers/session" });
    login = await app.inject({ method: "GET", url: "/auth/fyers/login" });
    assert.deepEqual(initialSession.json(), { configured: true, authenticated: false });
    assert.equal(login.statusCode, 302);

    const authorizationUrl = new URL(login.headers.location);
    const state = authorizationUrl.searchParams.get("state");
    const cookie = login.headers["set-cookie"].split(";")[0];
    assert.equal(authorizationUrl.searchParams.get("client_id"), "test-app-id");
    assert.equal(authorizationUrl.searchParams.get("redirect_uri"), process.env.FYERS_REDIRECT_URI);
    assert.match(login.headers["set-cookie"], /HttpOnly; SameSite=Lax/);

    const invalidCallback = await app.inject({
      method: "GET",
      url: `/auth/fyers/callback?auth_code=auth-code&state=${"0".repeat(64)}`,
      headers: { cookie },
    });
    assert.equal(invalidCallback.statusCode, 400);

    const callback = await app.inject({
      method: "GET",
      url: `/auth/fyers/callback?auth_code=auth-code&state=${state}`,
      headers: { cookie },
    });
    assert.equal(callback.statusCode, 302);
    assert.equal(callback.headers.location, "/fyers-login?status=connected");
    const callbackCookies = Array.isArray(callback.headers["set-cookie"])
      ? callback.headers["set-cookie"]
      : [callback.headers["set-cookie"]];
    const sessionCookie = callbackCookies
      .find((value) => value.startsWith("fyers_session="))
      .split(";")[0];
    assert.doesNotMatch(sessionCookie, /private-fyers-access-token/);
    assert.ok(callbackCookies.some((value) => value.startsWith("fyers_oauth_state=;")));
    assert.match(callbackCookies.find((value) => value.startsWith("fyers_session=")), /HttpOnly; SameSite=Lax/);
    assert.equal(fyersAuthRequest.url, "https://api-t1.fyers.in/api/v3/validate-authcode");
    assert.equal(fyersAuthRequest.options.method, "POST");
    assert.equal(fyersAuthRequest.options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(fyersAuthRequest.options.body), {
      grant_type: "authorization_code",
      code: "auth-code",
      appIdHash: createHash("sha256").update("test-app-id:test-app-secret").digest("hex"),
    });

    const authenticatedSession = await app.inject({
      method: "GET",
      url: "/api/fyers/session",
      headers: { cookie: sessionCookie },
    });
    assert.deepEqual(authenticatedSession.json(), { configured: true, authenticated: true });
    assert.doesNotMatch(authenticatedSession.body, /private-fyers-access-token/);

    const unauthenticatedSocketToken = await app.inject({
      method: "POST",
      url: "/api/fyers/ws-token",
    });
    assert.equal(unauthenticatedSocketToken.statusCode, 401);

    const socketToken = await app.inject({
      method: "POST",
      url: "/api/fyers/ws-token",
      headers: { cookie: sessionCookie },
    });
    assert.equal(socketToken.statusCode, 200);
    assert.deepEqual(socketToken.json(), {
      appId: "test-app-id",
      accessToken: "private-fyers-access-token",
    });
    assert.match(socketToken.headers["cache-control"], /no-store/);

    const anotherInstance = Fastify({ bodyLimit: 1_024 });
    registerSwingApiRoutes(anotherInstance);
    try {
      const crossInstanceSession = await anotherInstance.inject({
        method: "GET",
        url: "/api/fyers/session",
        headers: { cookie: sessionCookie },
      });
      assert.deepEqual(crossInstanceSession.json(), { configured: true, authenticated: true });
    } finally {
      await anotherInstance.close();
    }

    const unauthenticatedChart = await app.inject({
      method: "GET",
      url: "/api/fyers/candles?symbol=NSE%3ASBIN-EQ&resolution=5&from=2026-11-10&to=2026-11-18",
    });
    assert.equal(unauthenticatedChart.statusCode, 401);

    const candles = await app.inject({
      method: "GET",
      url: "/api/fyers/candles?symbol=NSE%3ASBIN-EQ&resolution=5&from=2026-11-10&to=2026-11-18",
      headers: { cookie: sessionCookie },
    });
    assert.equal(candles.statusCode, 200);
    assert.deepEqual(candles.json().candles, [{
      time: 1794307200,
      open: 100,
      high: 105,
      low: 99,
      close: 103,
      volume: 1200,
    }]);
    assert.equal(fyersAuthRequest.options.headers.Authorization, "test-app-id:private-fyers-access-token");

    const quote = await app.inject({
      method: "GET",
      url: "/api/fyers/quote?symbol=NSE%3ASBIN-EQ",
      headers: { cookie: sessionCookie },
    });
    assert.equal(quote.statusCode, 200);
    assert.deepEqual(quote.json(), {
      symbol: "NSE:SBIN-EQ",
      price: 104,
      volume: 1300,
      time: 1794307500,
    });

    const unauthenticatedOptionChain = await app.inject({
      method: "GET",
      url: "/api/fyers/options-chain",
    });
    assert.equal(unauthenticatedOptionChain.statusCode, 401);

    const optionChain = await app.inject({
      method: "GET",
      url: "/api/fyers/options-chain?strikecount=1&timestamp=1795300000",
      headers: { cookie: sessionCookie },
    });
    assert.equal(optionChain.statusCode, 200);
    assert.deepEqual(optionChain.json().options.map(({ symbol, optionType, strikePrice }) => ({
      symbol,
      optionType,
      strikePrice,
    })), [
      { symbol: "NSE:NIFTY26NOV24600CE", optionType: "CE", strikePrice: 24600 },
      { symbol: "NSE:NIFTY26NOV24600PE", optionType: "PE", strikePrice: 24600 },
    ]);
    assert.equal(fyersAuthRequest.options.headers.Authorization, "test-app-id:private-fyers-access-token");
    const optionChainUrl = new URL(fyersAuthRequest.url);
    assert.equal(optionChainUrl.pathname, "/data/options-chain-v3");
    assert.equal(optionChainUrl.searchParams.get("timestamp"), "1795300000");

    const logout = await app.inject({
      method: "POST",
      url: "/api/fyers/logout",
      headers: { cookie: sessionCookie },
    });
    const loggedOutSession = await app.inject({ method: "GET", url: "/api/fyers/session" });
    assert.deepEqual(logout.json(), { authenticated: false });
    assert.deepEqual(loggedOutSession.json(), { configured: true, authenticated: false });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Fastify serves Swagger and OpenAPI documentation for the GET endpoint", async () => {
  const [swagger, openApi] = await Promise.all([
    app.inject({ method: "GET", url: "/swagger.html" }),
    app.inject({ method: "GET", url: "/openapi.json" }),
  ]);

  assert.equal(swagger.statusCode, 200);
  assert.match(swagger.headers["content-type"], /text\/html/);
  assert.match(swagger.body, /SwaggerUIBundle/);
  assert.equal(openApi.statusCode, 200);
  assert.ok(openApi.json().paths["/api/liquidity-swing"].get);
  assert.ok(openApi.json().paths["/api/nifty-option-chain"].get);
});

test("serves the TradingView-inspired chart and local charting assets", async () => {
  const [page, client, styles, timeFormat, demoTrading, chartingLibrary, license] = await Promise.all([
    app.inject({ method: "GET", url: "/trading-view" }),
    app.inject({ method: "GET", url: "/trading-view/chart.js" }),
    app.inject({ method: "GET", url: "/trading-view/styles.css" }),
    app.inject({ method: "GET", url: "/trading-view/time-format.js" }),
    app.inject({ method: "GET", url: "/trading-view/demo-trading.js" }),
    app.inject({ method: "GET", url: "/trading-view/lightweight-charts.js" }),
    app.inject({ method: "GET", url: "/trading-view/lightweight-charts-license" }),
  ]);

  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Liquidity swings/);
  const intervalOptions = page.body.match(/<select id="intervals">[\s\S]*?<\/select>/)?.[0];
  const historyOptions = page.body.match(/<select id="range"[\s\S]*?<\/select>/)?.[0];
  const pivotOptions = page.body.match(/<select id="lookback">[\s\S]*?<\/select>/)?.[0];
  assert.ok(intervalOptions);
  assert.ok(historyOptions);
  assert.ok(pivotOptions);
  assert.match(intervalOptions, /<option value="1" selected>1m<\/option>/);
  assert.match(intervalOptions, /<option value="3">3m<\/option>/);
  assert.match(historyOptions, /<option value="1" selected>1 day<\/option>/);
  assert.match(pivotOptions, /<option value="5" selected>5<\/option>/);
  assert.match(client.body, /let currentResolution = "1"/);
  assert.match(client.body, /"3": 180/);
  assert.match(client.body, /resolution === "1" \? "" : "s"/);
  assert.equal(styles.statusCode, 200);
  assert.match(styles.body, /html\s*\{[^}]*overflow:\s*hidden;/);
  assert.match(styles.body, /body\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/);
  assert.match(styles.body, /\.swing-high-action-trigger\s*\{[^}]*border-radius:\s*50%;/);
  const toolbar = page.body.match(/<section class="chart-toolbar"[\s\S]*?<\/section>/)?.[0];
  assert.ok(toolbar);
  assert.match(toolbar, /id="range"/);
  assert.match(toolbar, /id="draw-popover"/);
  assert.match(toolbar, /data-tool="horizontal"/);
  const demoModeToggle = toolbar.match(/<input id="demo-mode-toggle"[^>]*>/)?.[0];
  assert.ok(demoModeToggle);
  assert.doesNotMatch(demoModeToggle, /\bchecked\b/);
  assert.match(page.body, /id="demo-trading-controls"/);
  assert.match(page.body, /id="demo-order-layer"/);
  assert.match(page.body, /id="demo-pnl-summary"/);
  const swingHighAction = page.body.match(/<button\s+id="swing-high-action-trigger"[\s\S]*?<\/button>/)?.[0];
  assert.ok(swingHighAction);
  assert.match(swingHighAction, />\+</);
  assert.doesNotMatch(swingHighAction, />Buy</);
  assert.doesNotMatch(page.body, /id="chart-controls"/);
  assert.doesNotMatch(page.body, /id="controls-toggle"/);
  assert.match(page.body, /NIFTY Options/);
  assert.match(page.body, /option-chain-panel/);
  assert.doesNotMatch(page.body, /class="topbar"/);
  assert.match(page.body, /Fyers account/);
  assert.match(page.body, /fyers-web-sdk-v3/);
  assert.match(client.headers["content-type"], /application\/javascript/);
  assert.match(client.body, /findLiquiditySwings/);
  assert.match(client.body, /tickMarkFormatter/);
  assert.match(timeFormat.headers["content-type"], /application\/javascript/);
  assert.match(timeFormat.body, /Asia\/Kolkata/);
  assert.match(demoTrading.headers["content-type"], /application\/javascript/);
  assert.match(demoTrading.body, /isDemoOrderTriggered/);
  assert.match(chartingLibrary.headers["content-type"], /application\/javascript/);
  assert.match(chartingLibrary.body, /LightweightCharts/);
  assert.match(license.body, /Apache License/);
});
