import assert from "node:assert/strict";
import { test } from "node:test";
import { callLiquiditySwingApi } from "../src/liquidity-swing-api.js";

test("requires the Cloudflare API token secret", async () => {
  await assert.rejects(
    callLiquiditySwingApi(),
    /Missing required Cloudflare secret LIQUIDITY_SWING_API_TOKEN/,
  );
});

test("reports unsuccessful API responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });

  try {
    await assert.rejects(
      callLiquiditySwingApi("test-api-token"),
      /Liquidity swing API request failed with status 503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
