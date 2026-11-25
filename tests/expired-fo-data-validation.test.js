import assert from "node:assert/strict";
import test from "node:test";
import {
  validateExpiredContractsQuery,
  validateExpiredExpiryDatesQuery,
  validateExpiredFoDataQuery,
} from "../src/fyers/middleware/validate-expired-fo-data.js";

function runValidation(query, validator = validateExpiredFoDataQuery) {
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

  validator({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("accepts valid expired F&O data parameters", () => {
  const query = {
    symbol: "NSE:NIFTY25MAR23000CE",
    resolution: "60",
    date_format: "1",
    range_from: "2025-03-26",
    range_to: "2025-03-27",
    include_oi: "1",
    include_greeks: "1",
  };
  const { response, continued } = runValidation(query);

  assert.equal(continued, true);
  assert.deepEqual(response.locals.expiredFoDataQuery, query);
});

test("rejects invalid include flags and non-increasing date ranges", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:NIFTY25MAR23000CE",
    resolution: "60",
    date_format: "1",
    range_from: "2025-03-27",
    range_to: "2025-03-27",
    include_oi: "true",
    include_greeks: "0",
  });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.details.range_to, "Must be later than range_from.");
  assert.equal(response.body.details.include_oi, "Use 0 or 1.");
});

test("validates the underlying symbol and expiry date for expired contracts", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:NIFTY50-INDEX",
    expiry_date: "2025-03-27",
  }, validateExpiredContractsQuery);

  assert.equal(continued, true);
  assert.equal(response.locals.expiredContractsQuery.expiry_date, "2025-03-27");

  const invalid = runValidation({
    symbol: "NSE:NIFTY50-INDEX",
    expiry_date: "2025-02-30",
  }, validateExpiredContractsQuery);
  assert.equal(invalid.continued, false);
  assert.equal(invalid.response.statusCode, 400);
});

test("validates expiry-date ranges for NIFTY", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:NIFTY50-INDEX",
    range_from: "2025-01-01",
    range_to: "2025-03-31",
    date_format: "1",
  }, validateExpiredExpiryDatesQuery);

  assert.equal(continued, true);
  assert.deepEqual(response.locals.expiredExpiryDatesQuery, {
    symbol: "NSE:NIFTY50-INDEX",
    range_from: "2025-01-01",
    range_to: "2025-03-31",
    date_format: "1",
  });

  const invalid = runValidation({
    symbol: "NSE:NIFTY50-INDEX",
    range_from: "2025-03-31",
    range_to: "2025-01-01",
    date_format: "1",
  }, validateExpiredExpiryDatesQuery);
  assert.equal(invalid.continued, false);
  assert.equal(invalid.response.body.details.range_to, "Must be later than range_from.");
});
