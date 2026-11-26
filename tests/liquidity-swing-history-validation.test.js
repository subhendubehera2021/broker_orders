import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLiquiditySwingHistoryQuery,
  validateLiquiditySwingAnalysisUpdate,
  validateLiquiditySwingHistoryUpdate,
} from "../src/internal/middleware/validate-liquidity-swing-history.js";

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

  validateLiquiditySwingHistoryQuery({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("defaults history pagination and accepts a custom page", () => {
  const defaults = runValidation({});
  assert.equal(defaults.continued, true);
  assert.deepEqual(defaults.response.locals.liquiditySwingHistoryQuery, {
    limit: 50,
    offset: 0,
    includeDeleted: false,
  });

  const custom = runValidation({ limit: "100", offset: "200", includeDeleted: "1" });
  assert.equal(custom.continued, true);
  assert.deepEqual(custom.response.locals.liquiditySwingHistoryQuery, {
    limit: 100,
    offset: 200,
    includeDeleted: true,
  });
});

test("validates server-side history filters", () => {
  const filtered = runValidation({
    limit: "25",
    offset: "50",
    includeDeleted: "1",
    resolution: "3",
    optionType: "CE",
    lookback: "7",
    status: "qualified",
    traded: "1",
    search: "NIFTY",
    pivotTimeFrom: "2026-04-01T00:00:00.000Z",
    pivotTimeTo: "2026-04-02T00:00:00.000Z",
  });
  assert.equal(filtered.continued, true);
  assert.deepEqual(filtered.response.locals.liquiditySwingHistoryQuery, {
    limit: 25,
    offset: 50,
    includeDeleted: true,
    resolution: "3",
    optionType: "CE",
    lookback: 7,
    status: "qualified",
    traded: true,
    search: "NIFTY",
    pivotTimeFrom: "2026-04-01T00:00:00.000Z",
    pivotTimeTo: "2026-04-02T00:00:00.000Z",
  });

  const invalid = runValidation({
    resolution: "unsupported",
    optionType: "XX",
    lookback: "0",
    status: "unknown",
    traded: "yes",
    pivotTimeFrom: "2026-04-02T00:00:00.000Z",
    pivotTimeTo: "2026-04-01T00:00:00.000Z",
  });
  assert.equal(invalid.continued, false);
  assert.deepEqual(Object.keys(invalid.response.body.details).sort(), [
    "lookback",
    "optionType",
    "pivotTime",
    "resolution",
    "status",
    "traded",
  ]);

  const notTraded = runValidation({ traded: "0" });
  assert.equal(notTraded.continued, true);
  assert.equal(notTraded.response.locals.liquiditySwingHistoryQuery.traded, false);
});

test("rejects invalid limits and offsets", () => {
  const { response, continued } = runValidation({ limit: "101", offset: "-1" });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(Object.keys(response.body.details).sort(), ["limit", "offset"]);

  const invalidFilter = runValidation({ includeDeleted: "true" });
  assert.equal(invalidFilter.continued, false);
  assert.equal(invalidFilter.response.body.details.includeDeleted, "Use 0 or 1.");
});

test("validates the history deleted flag and positive integer id", () => {
  const response = {
    locals: {},
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

  validateLiquiditySwingHistoryUpdate(
    { params: { id: "12" }, body: { is_deleted: true } },
    response,
    () => {
      continued = true;
    },
  );
  assert.equal(continued, true);
  assert.deepEqual(response.locals.liquiditySwingHistoryUpdate, {
    id: 12,
    isDeleted: true,
  });

  const invalid = {
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  validateLiquiditySwingHistoryUpdate(
    { params: { id: "0" }, body: { is_deleted: "true" } },
    invalid,
    () => {
      throw new Error("Invalid request should not continue.");
    },
  );
  assert.equal(invalid.statusCode, 400);
});

test("validates manual swing analysis fields", () => {
  const analysis = {
    comment: "Entry confirmed",
    is_traded: true,
    buy_price: 101.5,
    sell_price: null,
    high: 110,
    sl: 95,
    c_low: 98.5,
    qty: 2,
    p_l: -6,
  };
  const response = {
    locals: {},
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

  validateLiquiditySwingAnalysisUpdate(
    { params: { id: "12" }, body: analysis },
    response,
    () => {
      continued = true;
    },
  );
  assert.equal(continued, true);
  assert.deepEqual(response.locals.liquiditySwingAnalysisUpdate, {
    id: 12,
    analysis,
  });

  const invalid = {
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  validateLiquiditySwingAnalysisUpdate(
    {
      params: { id: "12" },
      body: { ...analysis, buy_price: -1, qty: 1.5, unknown: "value" },
    },
    invalid,
    () => {
      throw new Error("Invalid analysis should not continue.");
    },
  );
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(Object.keys(invalid.body.details).sort(), [
    "buy_price",
    "qty",
    "unknown",
  ]);
});
