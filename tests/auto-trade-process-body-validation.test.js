import assert from "node:assert/strict";
import test from "node:test";
import { validateAutoTradeProcessBody } from "../src/auto-trade-process/middleware/validate-auto-trade-process-body.js";

function runValidation(body) {
  const response = {
    locals: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  let continued = false;

  validateAutoTradeProcessBody({ body }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("validates option-chain inputs and multiple swing configurations", () => {
  const { response, continued } = runValidation({
    symbol: " NSE:NIFTY50-INDEX ",
    strikecount: 50,
    greeks: 0,
    ltpMin: 100,
    ltpMax: 140,
    swingConfigs: [
      { resolution: "1", pivotLookback: 5 },
      { resolution: 3, pivotLookback: 7 },
    ],
  });

  assert.equal(continued, true);
  assert.deepEqual(response.locals.optionChainQuery, {
    symbol: "NSE:NIFTY50-INDEX",
    strikecount: 50,
    greeks: 0,
    timestamp: "",
  });
  assert.deepEqual(response.locals.ltpRange, { ltpMin: 100, ltpMax: 140 });
  assert.deepEqual(response.locals.liquiditySwingConfigs, [
    { resolution: "1", pivotLookback: 5 },
    { resolution: "3", pivotLookback: 7 },
  ]);
});

test("rejects empty or duplicate swing configurations", () => {
  for (const swingConfigs of [
    [],
    [
      { resolution: "1", pivotLookback: 5 },
      { resolution: "1", pivotLookback: 5 },
    ],
  ]) {
    const { response, continued } = runValidation({
      symbol: "NSE:NIFTY50-INDEX",
      swingConfigs,
    });
    assert.equal(continued, false);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, "Invalid liquidity-swing configurations.");
  }
});
