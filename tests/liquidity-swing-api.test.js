import assert from "node:assert/strict";
import { test } from "node:test";
import { callLiquiditySwingApi } from "../src/liquidity-swing-api.js";

test("keeps the liquidity API request disabled", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(null, { status: 200 });
  };

  try {
    assert.equal(await callLiquiditySwingApi("test-api-token"), "disabled");
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
