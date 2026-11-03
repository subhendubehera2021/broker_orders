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
  KOTAK_NEO_PLACE_ORDER_PATH: "quick/order/rule/ms/place",
  KOTAK_NEO_ORDER_SOURCE: "NEOTRADEAPI",
  KOTAK_NEO_QUOTES_PATH: "script-details/1.0/quotes/neosymbol/{neo_symbols}/{quote_type}",
  KOTAK_NEO_NIFTY_INDEX_TOKEN: "Nifty 50",
  KOTAK_NEO_NIFTY_INDEX_SEGMENT: "nse_cm",
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
        placeOrderPath: "quick/order/rule/ms/place",
        orderSource: "NEOTRADEAPI",
        quotesPath: "script-details/1.0/quotes/neosymbol/{neo_symbols}/{quote_type}",
        niftyIndexToken: "Nifty 50",
        niftyIndexSegment: "nse_cm",
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

  it("allows startup without optional live-order settings", () => {
    const {
      KOTAK_NEO_PLACE_ORDER_PATH: _placeOrderPath,
      KOTAK_NEO_ORDER_SOURCE: _orderSource,
      ...environmentWithoutOrderSettings
    } = validEnvironment;

    const config = loadConfig(environmentWithoutOrderSettings);

    assert.equal(config.kotakNeo.placeOrderPath, undefined);
    assert.equal(config.kotakNeo.orderSource, undefined);
  });

  it("rejects non-HTTPS API URLs", () => {
    assert.throws(
      () => loadConfig({ ...validEnvironment, KOTAK_NEO_API_BASE_URL: "http://broker.example/" }),
      /KOTAK_NEO_API_BASE_URL must be a valid HTTPS URL/,
    );
  });
});
