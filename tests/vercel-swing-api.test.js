import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify from "fastify";
import { registerSwingApiRoutes } from "../src/swing-api-app.js";

const app = Fastify({ bodyLimit: 1_024 });
registerSwingApiRoutes(app);

after(async () => {
  await app.close();
});

test("Fastify swing API requires its shared secret before reading Kotak data", async () => {
  const previousSecret = process.env.SWING_API_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.SWING_API_SECRET = "shared-secret";
  globalThis.fetch = async () => {
    throw new Error("Kotak should not be requested");
  };

  let response;
  try {
    response = await app.inject({
      method: "POST",
      url: "/api/liquidity-swing",
      headers: { authorization: "Bearer wrong-secret" },
      payload: { instruments: [] },
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

test("Fastify swing API analyzes the call and put using server-side Kotak credentials", async () => {
  const previousEnv = {
    SWING_API_SECRET: process.env.SWING_API_SECRET,
    KOTAK_NEO_API_TOKEN: process.env.KOTAK_NEO_API_TOKEN,
    KOTAK_NEO_BASE_URL: process.env.KOTAK_NEO_BASE_URL,
  };
  const originalFetch = globalThis.fetch;
  const requestedTokens = [];
  Object.assign(process.env, {
    SWING_API_SECRET: "shared-secret",
    KOTAK_NEO_API_TOKEN: "dashboard-token",
    KOTAK_NEO_BASE_URL: "https://cis.kotaksecurities.com",
  });
  globalThis.fetch = async (url, options) => {
    requestedTokens.push(url.searchParams.get("neosymbol"));
    assert.equal(options.headers.Authorization, "dashboard-token");
    return Response.json({ status: "success", data: { candles: [] } });
  };

  let response;
  try {
    response = await app.inject({
      method: "POST",
      url: "/api/liquidity-swing",
      headers: { authorization: "Bearer shared-secret" },
      payload: {
        instruments: [
          { optionSide: "CALL", token: "nse_fo|1" },
          { optionSide: "PUT", token: "nse_fo|2" },
        ],
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(response.statusCode, 200);
  assert.deepEqual(requestedTokens, ["nse_fo|1", "nse_fo|2"]);
  assert.deepEqual(response.json().analyses, [
    {
      optionSide: "CALL",
      token: "nse_fo|1",
      interval: "1min",
      pivotLookback: 5,
      bars: 0,
      swing: null,
    },
    {
      optionSide: "PUT",
      token: "nse_fo|2",
      interval: "1min",
      pivotLookback: 5,
      bars: 0,
      swing: null,
    },
  ]);
});

test("Fastify serves Swagger and OpenAPI documentation", async () => {
  const [swagger, openApi] = await Promise.all([
    app.inject({ method: "GET", url: "/swagger.html" }),
    app.inject({ method: "GET", url: "/openapi.json" }),
  ]);

  assert.equal(swagger.statusCode, 200);
  assert.match(swagger.headers["content-type"], /text\/html/);
  assert.match(swagger.body, /SwaggerUIBundle/);
  assert.equal(openApi.statusCode, 200);
  assert.equal(openApi.json().paths["/api/liquidity-swing"].post.summary,
    "Analyze swing highs for a NIFTY call and put",
  );
});
