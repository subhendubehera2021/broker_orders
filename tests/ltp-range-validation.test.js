import assert from "node:assert/strict";
import test from "node:test";
import { validateLtpRange } from "../src/internal/middleware/validate-ltp-range.js";

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

  validateLtpRange({ query }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("parses an inclusive LTP range", () => {
  const { response, continued } = runValidation({
    ltpMin: "100.5",
    ltpMax: "300",
  });

  assert.equal(continued, true);
  assert.deepEqual(response.locals.ltpRange, { ltpMin: 100.5, ltpMax: 300 });
});

test("allows both LTP bounds to be omitted", () => {
  const { response, continued } = runValidation({});

  assert.equal(continued, true);
  assert.deepEqual(response.locals.ltpRange, { ltpMin: null, ltpMax: null });

  const lowerBoundOnly = runValidation({ ltpMin: "100" });
  assert.equal(lowerBoundOnly.continued, true);
  assert.deepEqual(lowerBoundOnly.response.locals.ltpRange, {
    ltpMin: 100,
    ltpMax: null,
  });
});

test("rejects invalid or reversed LTP bounds", () => {
  const { response, continued } = runValidation({
    ltpMin: "301",
    ltpMax: "300",
  });

  assert.equal(continued, false);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.details.ltpMax, "Must be greater than or equal to ltpMin.");

  const invalidBound = runValidation({ ltpMin: "abc" });
  assert.equal(invalidBound.continued, false);
  assert.equal(invalidBound.response.body.details.ltpMin, "Use a non-negative number.");
});
