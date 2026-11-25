import assert from "node:assert/strict";
import test from "node:test";
import { validateLiquiditySwingOptions } from "../src/auto-trade-process/middleware/validate-liquidity-swing-options.js";

function runValidation(query) {
  const response = {
    locals: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let continued = false;

  validateLiquiditySwingOptions({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("defaults liquidity-swing options", () => {
  const { response, continued } = runValidation({});

  assert.equal(continued, true);
  assert.deepEqual(response.locals.liquiditySwingConfigs, [
    { resolution: "1", pivotLookback: 5 },
  ]);
});

test("accepts custom resolution and pivot lookback", () => {
  const { response, continued } = runValidation({
    resolution: "5",
    pivotLookback: "8",
  });

  assert.equal(continued, true);
  assert.deepEqual(response.locals.liquiditySwingConfigs, [
    { resolution: "5", pivotLookback: 8 },
  ]);
});

test("rejects unsupported resolution and invalid pivot lookback", () => {
  for (const query of [
    { resolution: "invalid" },
    { resolution: ["1", "5"] },
    { pivotLookback: "0" },
    { pivotLookback: "1.5" },
  ]) {
    const { response, continued } = runValidation(query);
    assert.equal(continued, false);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, "Invalid liquidity-swing options.");
  }
});
