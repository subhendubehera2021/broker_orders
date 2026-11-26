import assert from "node:assert/strict";
import test from "node:test";
import { requireMasterApiKey } from "../src/internal/middleware/require-master-api-key.js";

function runMiddleware(value) {
  const response = {
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
  const request = {
    get(name) {
      assert.equal(name, "x-apikey");
      return value;
    },
  };

  requireMasterApiKey(request, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("accepts either configured master variable and validates x-apikey", () => {
  const previousApiKey = process.env.MASTER_API_KEY;
  const previousPasscode = process.env.MASTER_PASSCODE;
  try {
    delete process.env.MASTER_API_KEY;
    delete process.env.MASTER_PASSCODE;
    const unconfigured = runMiddleware("test-key");
    assert.equal(unconfigured.continued, false);
    assert.equal(unconfigured.response.statusCode, 503);

    process.env.MASTER_PASSCODE = "test-passcode";
    const missing = runMiddleware(undefined);
    assert.equal(missing.continued, false);
    assert.equal(missing.response.statusCode, 401);

    const invalid = runMiddleware("wrong-key");
    assert.equal(invalid.continued, false);
    assert.equal(invalid.response.statusCode, 401);

    const passcode = runMiddleware("test-passcode");
    assert.equal(passcode.continued, true);
    assert.equal(passcode.response.statusCode, 200);

    process.env.MASTER_API_KEY = "test-key";
    const apiKey = runMiddleware("test-key");
    assert.equal(apiKey.continued, true);
    assert.equal(apiKey.response.statusCode, 200);

    const passcodeWhenBothAreSet = runMiddleware("test-passcode");
    assert.equal(passcodeWhenBothAreSet.continued, false);
    assert.equal(passcodeWhenBothAreSet.response.statusCode, 401);
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.MASTER_API_KEY;
    } else {
      process.env.MASTER_API_KEY = previousApiKey;
    }
    if (previousPasscode === undefined) {
      delete process.env.MASTER_PASSCODE;
    } else {
      process.env.MASTER_PASSCODE = previousPasscode;
    }
  }
});
