import assert from "node:assert/strict";
import { test } from "node:test";
import handler from "../api/liquidity-swing.js";

function createResponse() {
  return {
    headers: {},
    statusCode: undefined,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("Vercel swing API requires its shared secret before reading Kotak data", async () => {
  const previousSecret = process.env.SWING_API_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.SWING_API_SECRET = "shared-secret";
  globalThis.fetch = async () => {
    throw new Error("Kotak should not be requested");
  };
  const response = createResponse();

  try {
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
        body: { instruments: [] },
      },
      response,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.SWING_API_SECRET;
    else process.env.SWING_API_SECRET = previousSecret;
  }

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "Unauthorized" });
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("Vercel swing API analyzes the call and put using server-side Kotak credentials", async () => {
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
  const response = createResponse();

  try {
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer shared-secret" },
        body: {
          instruments: [
            { optionSide: "CALL", token: "nse_fo|1" },
            { optionSide: "PUT", token: "nse_fo|2" },
          ],
        },
      },
      response,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(response.statusCode, 200);
  assert.deepEqual(requestedTokens, ["nse_fo|1", "nse_fo|2"]);
  assert.deepEqual(response.body.analyses, [
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
