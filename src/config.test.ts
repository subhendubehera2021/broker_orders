import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";

const validEnvironment: NodeJS.ProcessEnv = {
  HOST: "127.0.0.1",
  PORT: "3000",
  KOTAK_NEO_API_BASE_URL: "https://broker.example/",
  KOTAK_NEO_CONSUMER_KEY: "consumer-key",
  KOTAK_NEO_MOBILE_NUMBER: "+910000000000",
  KOTAK_NEO_UCC: "TESTUCC",
  KOTAK_NEO_MPIN: "654321",
  KOTAK_NEO_FIN_KEY: "financial-key",
  KOTAK_NEO_TOTP_LOGIN_PATH: "login",
  KOTAK_NEO_TOTP_VALIDATE_PATH: "validate",
  KOTAK_NEO_SCRIP_MASTER_PATH: "script-details/1.0/masterscrip/file-paths",
  KOTAK_NEO_MARGIN_PATH: "quick/user/check-margin",
  KOTAK_NEO_REQUEST_TIMEOUT_MS: "10000",
};

describe("loadConfig", () => {
  it("loads service and Kotak Neo settings from the environment", () => {
    assert.deepEqual(loadConfig(validEnvironment), {
      host: "127.0.0.1",
      port: 3000,
      kotakNeo: {
        apiBaseUrl: "https://broker.example/",
        consumerKey: "consumer-key",
        mobileNumber: "+910000000000",
        ucc: "TESTUCC",
        mpin: "654321",
        financialKey: "financial-key",
        totpLoginPath: "login",
        totpValidatePath: "validate",
        scripMasterPath: "script-details/1.0/masterscrip/file-paths",
        marginPath: "quick/user/check-margin",
        requestTimeoutMs: 10000,
      },
    });
  });

  it("requires environment-specific API settings", () => {
    const { KOTAK_NEO_FIN_KEY: _financialKey, ...incompleteEnvironment } = validEnvironment;

    assert.throws(
      () => loadConfig(incompleteEnvironment),
      /KOTAK_NEO_FIN_KEY must be configured/,
    );
  });

  it("rejects non-HTTPS API URLs", () => {
    assert.throws(
      () => loadConfig({ ...validEnvironment, KOTAK_NEO_API_BASE_URL: "http://broker.example/" }),
      /KOTAK_NEO_API_BASE_URL must be a valid HTTPS URL/,
    );
  });
});
