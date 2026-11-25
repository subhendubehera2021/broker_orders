import assert from "node:assert/strict";
import test from "node:test";
import { validateLiquiditySwingsQuery } from "../src/internal/middleware/validate-liquidity-swings.js";

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

  validateLiquiditySwingsQuery({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("validates explicit dates and applies analysis defaults", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:SBIN-EQ",
    fromDate: "2025-01-01",
    toDate: "2025-01-03",
  });

  assert.equal(continued, true);
  assert.deepEqual(response.locals.liquiditySwingQuery, {
    symbol: "NSE:SBIN-EQ",
    fromDate: "2025-01-01",
    toDate: "2025-01-03",
    resolution: "1",
    pivotLookback: 5,
  });
});

test("defaults missing dates to a recent India date range", () => {
  const { response, continued } = runValidation({ symbol: "NSE:SBIN-EQ" });
  const { fromDate, toDate } = response.locals.liquiditySwingQuery;

  assert.equal(continued, true);
  assert.match(fromDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(toDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(Date.parse(toDate) - Date.parse(fromDate), 3 * 24 * 60 * 60 * 1000);
});

test("requires date pairs and validates resolution and pivot lookback", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:SBIN-EQ",
    fromDate: "2025-01-02",
    resolution: "invalid",
    pivotLookback: "0",
  });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.details.fromDate, "Provide both fromDate and toDate.");
  assert.equal(response.body.details.resolution, "Unsupported Fyers historical candle resolution.");
  assert.equal(response.body.details.pivotLookback, "Use a positive integer.");
});
