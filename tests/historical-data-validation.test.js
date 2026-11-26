import assert from "node:assert/strict";
import test from "node:test";
import { validateHistoricalDataQuery } from "../src/fyers/middleware/validate-historical-data.js";

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

  validateHistoricalDataQuery({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("accepts valid epoch-based historical data parameters", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:SBIN-EQ",
    resolution: "D",
    date_format: "0",
    range_from: "1690895316",
    range_to: "1691068173",
    cont_flag: "1",
  });

  assert.equal(continued, true);
  assert.equal(response.locals.historicalDataQuery.cont_flag, "1");
});

test("accepts Fyers five-second historical resolution", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:SBIN-EQ",
    resolution: "5S",
    date_format: "1",
    range_from: "2026-01-01",
    range_to: "2026-01-02",
  });

  assert.equal(continued, true);
  assert.equal(response.locals.historicalDataQuery.resolution, "5S");
});

test("rejects a range whose end is not after its start", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:SBIN-EQ",
    resolution: "D",
    date_format: "1",
    range_from: "2026-01-02",
    range_to: "2026-01-01",
  });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.details.range_to, "Must be later than range_from.");
});

test("rejects invalid calendar dates", () => {
  const { response, continued } = runValidation({
    symbol: "NSE:SBIN-EQ",
    resolution: "D",
    date_format: "1",
    range_from: "2026-02-30",
    range_to: "2026-03-01",
  });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.details.range_from, "Use a valid YYYY-MM-DD date when date_format is 1.");
});
