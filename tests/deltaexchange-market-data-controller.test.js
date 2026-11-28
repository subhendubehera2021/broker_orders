import assert from "node:assert/strict";
import test from "node:test";
import { getCandles } from "../src/deltaexchange/controllers/market-data.controller.js";

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("rejects malformed or incomplete historical candle ranges", async () => {
  for (const query of [
    { start: "1700000000" },
    { start: "1700000000.5", end: "1700003600" },
    { start: ["1700000000"], end: "1700003600" },
  ]) {
    const response = createResponse();
    await getCandles({ query }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.body.error,
      "Both start and end must be Unix timestamps in seconds.",
    );
  }
});

test("rejects historical candle ranges longer than 31 elapsed days", async () => {
  const start = 1_700_000_000;
  const response = createResponse();
  await getCandles({
    query: {
      start: String(start),
      end: String(start + 31 * 24 * 60 * 60 + 1),
    },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "The requested backtest date range is invalid.");
});

test("rejects unsupported quick breakout ranges and mixed range parameters", async () => {
  const unsupportedResponse = createResponse();
  await getCandles({ query: { days: "6" } }, unsupportedResponse);
  assert.equal(unsupportedResponse.statusCode, 400);
  assert.equal(
    unsupportedResponse.body.error,
    "days must be one of 3, 7, 15, 30, 60, 90, 120, 180.",
  );

  const mixedResponse = createResponse();
  await getCandles({
    query: { start: "1700000000", end: "1700003600", days: "3" },
  }, mixedResponse);
  assert.equal(mixedResponse.statusCode, 400);
  assert.equal(
    mixedResponse.body.error,
    "Use either a historical date range or a quick breakout range, not both.",
  );
});

test("rejects unsupported candle resolutions", async () => {
  for (const resolution of ["2m", ["1m"]]) {
    const response = createResponse();
    await getCandles({ query: { resolution } }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(
      response.body.error,
      "resolution must be 1m, 3m, 5m, or 15m.",
    );
  }
});
