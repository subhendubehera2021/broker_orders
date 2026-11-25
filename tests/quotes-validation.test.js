import assert from "node:assert/strict";
import test from "node:test";
import { validateQuotesQuery } from "../src/middleware/validate-quotes.js";

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

  validateQuotesQuery({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("parses comma-separated quote symbols for the Fyers SDK", () => {
  const { response, continued } = runValidation({
    symbols: "NSE:SBIN-EQ, NSE:TCS-EQ",
  });

  assert.equal(continued, true);
  assert.deepEqual(response.locals.quoteSymbols, ["NSE:SBIN-EQ", "NSE:TCS-EQ"]);
});

test("rejects empty symbol entries and lists over the 50-symbol limit", () => {
  const emptyEntry = runValidation({ symbols: "NSE:SBIN-EQ,,NSE:TCS-EQ" });
  assert.equal(emptyEntry.continued, false);
  assert.equal(emptyEntry.response.statusCode, 400);
  assert.equal(emptyEntry.response.body.details.symbols, "Symbols must not be empty.");

  const tooManySymbols = runValidation({
    symbols: Array.from({ length: 51 }, (_, index) => `NSE:SYMBOL${index}-EQ`).join(","),
  });
  assert.equal(tooManySymbols.continued, false);
  assert.equal(tooManySymbols.response.statusCode, 400);
  assert.equal(tooManySymbols.response.body.details.symbols, "A maximum of 50 symbols is allowed.");
});
