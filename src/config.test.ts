import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";

const validEnvironment: NodeJS.ProcessEnv = {
  HOST: "127.0.0.1",
  PORT: "3000",
  OPEN_ORDER_PRICE_STEP: "1",
  AUTO_SELL_STOP_LOSS_RUPEES: "5",
  WEB_ACCESS_PASSCODE: "SKB9178",
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
  KOTAK_NEO_ORDER_BOOK_PATH: "quick/user/orders",
  KOTAK_NEO_CANCEL_ORDER_PATH: "quick/order/cancel",
  KOTAK_NEO_MODIFY_ORDER_PATH: "quick/order/vr/modify",
  KOTAK_NEO_POSITIONS_PATH: "quick/user/positions",
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
      openOrderPriceStep: 1,
      autoSellStopLossRupees: 5,
      webAccessPasscode: "SKB9178",
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
        orderBookPath: "quick/user/orders",
        cancelOrderPath: "quick/order/cancel",
        modifyOrderPath: "quick/order/vr/modify",
        positionsPath: "quick/user/positions",
        placeOrderPath: "quick/order/rule/ms/place",
        orderSource: "NEOTRADEAPI",
        quotesPath: "script-details/1.0/quotes/neosymbol/{neo_symbols}/{quote_type}",
        niftyIndexToken: "Nifty 50",
        niftyIndexSegment: "nse_cm",
        logKotakLoginResponses: false,
        requestTimeoutMs: 10000,
      },
    });
  });

  it("defaults the open-order price step to one rupee and validates custom steps", () => {
    const { OPEN_ORDER_PRICE_STEP: _priceStep, ...environmentWithoutPriceStep } = validEnvironment;

    assert.equal(loadConfig(environmentWithoutPriceStep).openOrderPriceStep, 1);
    assert.equal(
      loadConfig({ ...validEnvironment, OPEN_ORDER_PRICE_STEP: "0.5" }).openOrderPriceStep,
      0.5,
    );
    assert.throws(
      () => loadConfig({ ...validEnvironment, OPEN_ORDER_PRICE_STEP: "1.01" }),
      /OPEN_ORDER_PRICE_STEP must be a positive multiple of ₹0\.05/,
    );
  });

  it("defaults and validates the auto-sell stop-loss amount", () => {
    const {
      AUTO_SELL_STOP_LOSS_RUPEES: _stopLoss,
      ...environmentWithoutStopLoss
    } = validEnvironment;

    assert.equal(loadConfig(environmentWithoutStopLoss).autoSellStopLossRupees, 5);
    assert.equal(
      loadConfig({ ...validEnvironment, AUTO_SELL_STOP_LOSS_RUPEES: "7.25" })
        .autoSellStopLossRupees,
      7.25,
    );
    assert.throws(
      () => loadConfig({ ...validEnvironment, AUTO_SELL_STOP_LOSS_RUPEES: "0" }),
      /AUTO_SELL_STOP_LOSS_RUPEES must be a positive rupee amount/,
    );
    assert.throws(
      () => loadConfig({ ...validEnvironment, AUTO_SELL_STOP_LOSS_RUPEES: "1.001" }),
      /AUTO_SELL_STOP_LOSS_RUPEES must be a positive rupee amount/,
    );
  });

  it("requires environment-specific API settings", () => {
    const { KOTAK_NEO_FIN_KEY: _financialKey, ...incompleteEnvironment } = validEnvironment;

    assert.throws(
      () => loadConfig(incompleteEnvironment),
      /KOTAK_NEO_FIN_KEY must be configured/,
    );
  });

  it("requires a valid frontend passcode", () => {
    const { WEB_ACCESS_PASSCODE: _passcode, ...environmentWithoutPasscode } = validEnvironment;

    assert.throws(
      () => loadConfig(environmentWithoutPasscode),
      /WEB_ACCESS_PASSCODE must be configured/,
    );
    assert.throws(
      () => loadConfig({ ...validEnvironment, WEB_ACCESS_PASSCODE: "bad-passcode" }),
      /WEB_ACCESS_PASSCODE must be 1-32 uppercase letters or digits/,
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

  it("allows startup without optional order-book settings", () => {
    const {
      KOTAK_NEO_ORDER_BOOK_PATH: _orderBookPath,
      ...environmentWithoutOrderBookPath
    } = validEnvironment;

    const config = loadConfig(environmentWithoutOrderBookPath);

    assert.equal(config.kotakNeo.orderBookPath, undefined);
  });

  it("allows startup without optional cancel-order settings", () => {
    const {
      KOTAK_NEO_CANCEL_ORDER_PATH: _cancelOrderPath,
      ...environmentWithoutCancelOrderPath
    } = validEnvironment;

    const config = loadConfig(environmentWithoutCancelOrderPath);

    assert.equal(config.kotakNeo.cancelOrderPath, undefined);
  });

  it("allows startup without optional modify-order settings", () => {
    const {
      KOTAK_NEO_MODIFY_ORDER_PATH: _modifyOrderPath,
      ...environmentWithoutModifyOrderPath
    } = validEnvironment;

    const config = loadConfig(environmentWithoutModifyOrderPath);

    assert.equal(config.kotakNeo.modifyOrderPath, undefined);
  });

  it("allows startup without optional positions settings", () => {
    const {
      KOTAK_NEO_POSITIONS_PATH: _positionsPath,
      ...environmentWithoutPositionsPath
    } = validEnvironment;

    const config = loadConfig(environmentWithoutPositionsPath);

    assert.equal(config.kotakNeo.positionsPath, undefined);
  });

  it("enables sanitized Kotak login response logs only when explicitly enabled", () => {
    assert.equal(
      loadConfig({ ...validEnvironment, KOTAK_NEO_LOG_LOGIN_RESPONSES: "true" }).kotakNeo
        .logKotakLoginResponses,
      true,
    );
    assert.equal(
      loadConfig({ ...validEnvironment, KOTAK_NEO_LOG_LOGIN_RESPONSES: "false" }).kotakNeo
        .logKotakLoginResponses,
      false,
    );
    assert.throws(
      () => loadConfig({ ...validEnvironment, KOTAK_NEO_LOG_LOGIN_RESPONSES: "on" }),
      /KOTAK_NEO_LOG_LOGIN_RESPONSES must be true or false/,
    );
  });

  it("rejects non-HTTPS API URLs", () => {
    assert.throws(
      () => loadConfig({ ...validEnvironment, KOTAK_NEO_API_BASE_URL: "http://broker.example/" }),
      /KOTAK_NEO_API_BASE_URL must be a valid HTTPS URL/,
    );
  });
});
