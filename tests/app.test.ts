import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import {
  KotakNeoError,
  type AuthenticatedSession,
  type PlaceNiftyOptionOrderInput,
} from "../src/kotak-neo-client.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 3000,
  apiKey: "SKB9178",
  openOrderPriceStep: 1,
  autoSellStopLossRupees: 5,
  webAccessPasscode: "SKB9178",
  kotakNeo: {
    apiBaseUrl: "https://kotak.example/",
    consumerKey: "test-consumer-key",
    mobileNumber: "+910000000000",
    ucc: "TESTUCC",
    mpin: "654321",
    financialKey: "test-financial-key",
    totpLoginPath: "test/login",
    totpValidatePath: "test/validate",
    scripMasterPath: "script-details/1.0/masterscrip/file-paths",
    marginPath: "quick/user/check-margin",
    placeOrderPath: "quick/order/rule/ms/place",
    orderSource: "NEOTRADEAPI",
    quotesPath: "script-details/1.0/quotes/neosymbol/{neo_symbols}/{quote_type}",
    niftyIndexToken: "Nifty 50",
    niftyIndexSegment: "nse_cm",
    requestTimeoutMs: 1000,
  },
};

const authenticatedSession: AuthenticatedSession = {
  sid: "private-sid",
  tradeToken: "private-trade-token",
};

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("app routes", () => {
  it("serves the login page without caching it", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject({ url: "/" });

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /Registered mobile number/);
    assert.match(response.body, /Authenticator code/);
    assert.match(response.body, /value="\+910000000000" readonly/);
    assert.match(response.body, /value="TESTUCC" readonly/);
    assert.match(response.body, /href="\/docs\/">Open API Documentation/);
    assert.match(response.body, /fetch\("\/api\/auth\/login"/);
  });

  it("serves Swagger UI and OpenAPI document", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const docs = await app.inject("/docs/");
    const spec = await app.inject("/docs/json");

    assert.equal(docs.statusCode, 200);
    assert.match(docs.body, /swagger-ui/i);
    assert.equal(spec.statusCode, 200);
    const openapi = spec.json();
    assert.equal(openapi.openapi, "3.0.3");
    assert.equal(openapi.info.title, "Kotak Neo API");
  });

  it("serves health status", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject("/health");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
  });

  it("completes login without returning broker tokens", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
      },
    });
    apps.push(app);

    const initial = await app.inject("/api/auth/session");
    assert.deepEqual(initial.json(), { authenticated: false, orderReady: false });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });
    assert.equal(loginResponse.statusCode, 200);
    assert.deepEqual(loginResponse.json(), { authenticated: true });

    const current = await app.inject("/api/auth/session");
    assert.deepEqual(current.json(), { authenticated: true, orderReady: true });
  });

  it("clears session state on logout", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
      },
    });
    apps.push(app);

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });
    assert.equal(logoutResponse.statusCode, 200);
    assert.deepEqual(logoutResponse.json(), { authenticated: false });

    const current = await app.inject("/api/auth/session");
    assert.deepEqual(current.json(), { authenticated: false, orderReady: false });
  });

  it("returns stored login session details when valid x-api-key header is provided", async () => {
    const detailedSession: AuthenticatedSession = {
      sid: "session-sid-123",
      tradeToken: "trade-token-456",
      baseUrl: "https://broker.example/",
      user: "TESTUCC",
    };
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return detailedSession;
        },
      },
    });
    apps.push(app);

    const unauthorized = await app.inject({
      method: "GET",
      url: "/api/auth/session-details",
      headers: { "x-api-key": "wrong-key" },
    });
    assert.equal(unauthorized.statusCode, 401);

    const notFound = await app.inject({
      method: "GET",
      url: "/api/auth/session-details",
      headers: { "x-api-key": "SKB9178" },
    });
    assert.equal(notFound.statusCode, 404);

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });

    const success = await app.inject({
      method: "GET",
      url: "/api/auth/session-details",
      headers: { "x-api-key": "SKB9178" },
    });
    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.json(), {
      authenticated: true,
      session: detailedSession,
    });
  });

  it("requires authentication before placing a NIFTY option order", async () => {
    let orderCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async placeNiftyOptionOrder() {
          orderCalls += 1;
          return { stat: "Ok" };
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/options/nifty/order",
      payload: {
        expiry: "30JAN2030",
        tradingSymbol: "NIFTY30JAN2030CE",
        transactionType: "B",
        quantity: "25",
        product: "MIS",
        orderType: "L",
        price: "100",
        validity: "DAY",
      },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(orderCalls, 0);
  });

  it("returns a clear configuration error when live order settings are absent", async () => {
    const { placeOrderPath: _placeOrderPath, orderSource: _orderSource, ...kotakNeo } =
      config.kotakNeo;
    const app = buildApp({
      config: { ...config, kotakNeo },
      authClient: {
        async login() {
          return authenticatedSession;
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/options/nifty/order",
      payload: {
        expiry: "30JAN2030",
        tradingSymbol: "NIFTY30JAN2030CE",
        transactionType: "B",
        quantity: "25",
        product: "MIS",
        orderType: "L",
        price: "100",
        validity: "DAY",
      },
    });

    assert.equal(response.statusCode, 503);
    assert.match(response.json().error, /KOTAK_NEO_PLACE_ORDER_PATH and KOTAK_NEO_ORDER_SOURCE/);
  });

  it("rejects orders for unlisted contracts and quantities that are not whole lots", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000,25`,
    ].join("\n");
    let orderCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return { ...authenticatedSession, serverId: "test-server-id" };
        },
        async placeNiftyOptionOrder() {
          orderCalls += 1;
          return { stat: "Ok" };
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const basePayload = {
      expiry: "30JAN2030",
      tradingSymbol: "NIFTY30JAN2030CE",
      transactionType: "B",
      quantity: "25",
      product: "MIS",
      orderType: "L",
      price: "100",
      validity: "DAY",
    };
    const unknownContract = await app.inject({
      method: "POST",
      url: "/api/options/nifty/order",
      payload: { ...basePayload, tradingSymbol: "NIFTY30JAN2030PE" },
    });
    const fractionalLot = await app.inject({
      method: "POST",
      url: "/api/options/nifty/order",
      payload: { ...basePayload, quantity: "20" },
    });

    assert.equal(unknownContract.statusCode, 400);
    assert.equal(fractionalLot.statusCode, 400);
    assert.equal(orderCalls, 0);
  });

  it("submits a validated NIFTY order using the contract from the local Scrip Master", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000,25`,
    ].join("\n");
    let orderSession: AuthenticatedSession | undefined;
    let orderInput: unknown;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return { ...authenticatedSession, serverId: "server-id" };
        },
        async placeNiftyOptionOrder(session, input) {
          orderSession = session;
          orderInput = input;
          return { stat: "Ok", nOrdNo: "order-id" };
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/options/nifty/order",
      payload: {
        expiry: "30JAN2030",
        tradingSymbol: "NIFTY30JAN2030CE",
        transactionType: "B",
        quantity: "50",
        product: "MIS",
        orderType: "L",
        price: "100",
        validity: "DAY",
        tag: "test-order",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { stat: "Ok", nOrdNo: "order-id" });
    assert.deepEqual(orderSession, { ...authenticatedSession, serverId: "server-id" });
    assert.deepEqual(orderInput, {
      tradingSymbol: "NIFTY30JAN2030CE",
      instrumentToken: "123",
      transactionType: "B",
      quantity: "50",
      product: "MIS",
      orderType: "L",
      price: "100",
      validity: "DAY",
      amo: "NO",
      disclosedQuantity: "0",
      marketProtection: "0",
      triggerPrice: "0",
      tag: "test-order",
    });
  });

  it("accepts each documented NIFTY order type and sends bracket parameters", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000,25`,
    ].join("\n");
    const submittedOrders: unknown[] = [];
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async placeNiftyOptionOrder(_session, input) {
          submittedOrders.push(input);
          return { stat: "Ok" };
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const basePayload = {
      expiry: "30JAN2030",
      tradingSymbol: "NIFTY30JAN2030CE",
      transactionType: "B",
      quantity: "25",
      product: "MIS",
      orderType: "L",
      price: "100",
      validity: "DAY",
    };
    const orderVariations = [
      { orderType: "L" },
      { orderType: "MKT", price: "0" },
      { orderType: "SL", triggerPrice: "90" },
      { orderType: "SL-M", price: "0", triggerPrice: "90" },
      { product: "CO", triggerPrice: "90" },
      {
        product: "BO",
        squareOffType: "Ticks",
        stopLossType: "Absolute",
        stopLossValue: "10",
        squareOffValue: "20",
        trailingStopLoss: "N",
        trailingSlValue: "0",
      },
    ];

    for (const variation of orderVariations) {
      const response = await app.inject({
        method: "POST",
        url: "/api/options/nifty/order",
        payload: { ...basePayload, ...variation },
      });
      assert.equal(response.statusCode, 200, response.body);
    }

    assert.equal(submittedOrders.length, orderVariations.length);
    assert.equal(
      (submittedOrders[5] as { instrumentToken: string }).instrumentToken,
      "123",
    );
    assert.equal(
      (submittedOrders[5] as { trailingSlValue: string }).trailingSlValue,
      "0",
    );
  });

  it("rejects CNC and MTF products for NIFTY F&O", async () => {
    let orderCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async placeNiftyOptionOrder() {
          orderCalls += 1;
          return { stat: "Ok" };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    for (const product of ["CNC", "MTF"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/options/nifty/order",
        payload: {
          expiry: "30JAN2030",
          tradingSymbol: "NIFTY30JAN2030CE",
          transactionType: "B",
          quantity: "25",
          product,
          orderType: "L",
          price: "100",
          validity: "DAY",
        },
      });
      assert.equal(response.statusCode, 400);
      assert.match(response.json().error, new RegExp(product));
    }
    assert.equal(orderCalls, 0);
  });

  it("rejects a BUY stop-limit order whose limit is below its trigger", async () => {
    let orderCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return { ...authenticatedSession, serverId: "test-server-id" };
        },
        async placeNiftyOptionOrder() {
          orderCalls += 1;
          return { stat: "Ok" };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/options/nifty/order",
      payload: {
        expiry: "30JAN2030",
        tradingSymbol: "NIFTY30JAN2030CE",
        transactionType: "B",
        quantity: "25",
        product: "MIS",
        orderType: "SL",
        price: "100",
        triggerPrice: "101",
        validity: "DAY",
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /greater than or equal/);
    assert.equal(orderCalls, 0);
  });

  it("places a simplified BUY SL-Limit order with minimal body data", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000,25`,
    ].join("\n");
    let submittedInput: unknown;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async placeNiftyOptionOrder(_session, input) {
          submittedInput = input;
          return { stat: "Ok", nOrdNo: "order-sl-1" };
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/orders/buy-sl-limit",
      payload: {
        tradingSymbol: "NIFTY30JAN2030CE",
        quantity: "25",
        triggerPrice: "105",
        amo: "NO",
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json(), { stat: "Ok", nOrdNo: "order-sl-1" });
    assert.deepEqual(submittedInput, {
      tradingSymbol: "NIFTY30JAN2030CE",
      instrumentToken: "123",
      transactionType: "B",
      quantity: "25",
      product: "MIS",
      orderType: "SL",
      price: "105.20",
      validity: "DAY",
      amo: "NO",
      disclosedQuantity: "0",
      marketProtection: "0",
      triggerPrice: "105.00",
    });
  });
});
