import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify from "fastify";
import { registerSwingApiRoutes } from "../src/swing-api-app.js";

const app = Fastify({ bodyLimit: 1_024 });
let persistedAnalyses;
let persistedOptionChain;
let dbClientCalls = 0;
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
    assert.equal(options.headers.Authorization, "dashboard-token");
    if (url.pathname.endsWith("/option-chain")) {
      assert.equal(url.searchParams.get("count"), "10");
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

    requestedTokens.push(url.searchParams.get("neosymbol"));
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
    assert.equal(url.pathname, "/market-data/1.0/watchlist/option-chain");
    assert.equal(url.searchParams.get("count"), "10");
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
