import assert from "node:assert/strict";
import test from "node:test";
import { validateOptionChainQuery } from "../src/fyers/middleware/validate-option-chain.js";

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

  validateOptionChainQuery({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("accepts valid option-chain parameters and defaults timestamp to current data", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:SBIN-EQ",
    strikecount: "1",
    greeks: "1",
  });

  assert.equal(continued, true);
  assert.deepEqual(response.locals.optionChainQuery, {
    symbol: "NSE:SBIN-EQ",
    timestamp: "",
    strikecount: 1,
    greeks: 1,
  });
});

test("rejects symbols with multiple values and strike counts above the provider limit", () => {
  const { response, continued } = runValidation({
    symbol: ["NSE:SBIN-EQ", "NSE:TCS-EQ"],
    strikecount: "51",
    greeks: "2",
  });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.details.symbol, "A single symbol is required.");
  assert.equal(response.body.details.strikecount, "Use an integer between 1 and 50.");
  assert.equal(response.body.details.greeks, "Use 0 or 1.");
});
