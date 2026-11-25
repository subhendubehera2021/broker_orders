import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import {
  KotakNeoError,
  type AuthenticatedSession,
  type PlaceNiftyOptionOrderInput,
} from "../src/kotak-neo/client.js";

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
    cancelOrderPath: "quick/order/cancel",
    historicalDataPath: "market-data/1.0/historical/details",
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
    assert.equal(openapi.info.title, "Broker Orders API");
    assert.deepEqual(openapi.components.securitySchemes.AppApiKey, {
      type: "apiKey",
      in: "header",
      name: "x-api-key",
    });
    assert.ok(openapi.paths["/api/paytm-money/auth/login"]);
    assert.ok(openapi.paths["/api/paytm-money/auth/callback"]);
    assert.ok(openapi.paths["/api/paytm-money/user-details"]);
    assert.deepEqual(
      openapi.paths["/api/paytm-money/user-details"].get.security,
      [{ AppApiKey: [] }],
    );

    for (const [method, legacyPath] of [
      ["get", "/api/auth/session"],
      ["get", "/api/auth/session-details"],
      ["post", "/api/auth/login"],
      ["post", "/api/auth/logout"],
      ["post", "/api/options/nifty/order"],
      ["post", "/api/orders/buy-sl-limit"],
      ["post", "/api/orders/sell-sl-limit"],
      ["post", "/api/orders/cancel"],
      ["get", "/api/market-data/historical"],
    ] as const) {
      const operation = openapi.paths[legacyPath][method];
      assert.equal(operation.deprecated, true, legacyPath);
      assert.ok(openapi.paths[legacyPath.replace(/^\/api\//, "/api/kotak-neo/")][method]);
    }
  });

  it("does not expose the removed historical chart page or assets", async () => {
    const app = buildApp({ config });
    apps.push(app);

    for (const path of [
      "/historical-chart",
      "/assets/lightweight-charts.js",
      "/assets/liquidity-swing.js",
    ]) {
      const response = await app.inject(path);
      assert.equal(response.statusCode, 404, path);
    }
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
      url: "/api/kotak-neo/auth/login",
      payload: { totp: "123456" },
    });
    assert.equal(loginResponse.statusCode, 200);
    assert.deepEqual(loginResponse.json(), { authenticated: true });

    const current = await app.inject("/api/auth/session");
    assert.deepEqual(current.json(), { authenticated: true, orderReady: true });
  });

  it("documents and completes Paytm Money login without exposing broker tokens", async () => {
    let loginState: string | undefined;
    let usedAccessToken: string | undefined;
    const details = {
      data: {
        kycName: "Example User",
        userId: 123,
        activeSegments: ["CASH", "FO"],
      },
    };
    const app = buildApp({
      config,
      paytmMoneyClient: {
        createLoginUrl(state) {
          loginState = state;
          return new URL(`https://login.paytmmoney.com/merchant-login?state=${state}`);
        },
        async generateAccessToken(requestToken) {
          assert.equal(requestToken, "request-token");
          return {
            merchant_id: "148",
            channel_id: "API-148",
            api_key: "test-api-key",
            access_token: "private-access-token",
            public_access_token: "private-public-token",
            read_access_token: "private-read-token",
          };
        },
        async getUserDetails(accessToken) {
          usedAccessToken = accessToken;
          return details;
        },
      },
    });
    apps.push(app);

    const notConfigured = buildApp({ config });
    apps.push(notConfigured);
    const unavailable = await notConfigured.inject("/api/paytm-money/auth/login");
    assert.equal(unavailable.statusCode, 503);

    const login = await app.inject("/api/paytm-money/auth/login");
    assert.equal(login.statusCode, 200);
    assert.ok(loginState);
    assert.equal(new URL(login.json().loginUrl).searchParams.get("state"), loginState);

    const invalidCallback = await app.inject({
      url: "/api/paytm-money/auth/callback?request_token=request-token&state=wrong",
    });
    assert.equal(invalidCallback.statusCode, 400);
    assert.deepEqual(invalidCallback.json(), {
      error: "Paytm Money login state does not match",
    });

    const callback = await app.inject({
      url: `/api/paytm-money/auth/callback?success=true&requestToken=request-token&state=${loginState}`,
    });
    assert.equal(callback.statusCode, 200);
    assert.deepEqual(callback.json(), { authenticated: true });
    assert.doesNotMatch(callback.body, /private-(?:access|public|read)-token/);

    const unauthorized = await app.inject("/api/paytm-money/user-details");
    assert.equal(unauthorized.statusCode, 401);

    const userDetails = await app.inject({
      url: "/api/paytm-money/user-details",
      headers: { "x-api-key": "SKB9178" },
    });
    assert.equal(userDetails.statusCode, 200);
    assert.deepEqual(userDetails.json(), details);
    assert.equal(usedAccessToken, "private-read-token");

    const logout = await app.inject({
      method: "POST",
      url: "/api/paytm-money/auth/logout",
      headers: { "x-api-key": "SKB9178" },
    });
    assert.equal(logout.statusCode, 200);
    assert.deepEqual(logout.json(), { authenticated: false });

    const noSession = await app.inject({
      url: "/api/paytm-money/user-details",
      headers: { "x-api-key": "SKB9178" },
    });
    assert.equal(noSession.statusCode, 404);
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

  it("returns a clear configuration error when cancel order setting is absent", async () => {
    const { cancelOrderPath: _cancelOrderPath, ...kotakNeo } = config.kotakNeo;
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
      url: "/api/orders/cancel",
      payload: { orderNumber: "2105199703091997" },
    });

    assert.equal(response.statusCode, 503);
    assert.match(response.json().error, /KOTAK_NEO_CANCEL_ORDER_PATH/);
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
      price: "105.10",
      validity: "DAY",
      amo: "NO",
      disclosedQuantity: "0",
      marketProtection: "0",
      triggerPrice: "105.00",
    });
  });

  it("places simplified SELL SL-Limit orders with the limit below the trigger", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000,25`,
    ].join("\n");
    const submittedInputs: PlaceNiftyOptionOrderInput[] = [];
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async placeNiftyOptionOrder(_session, input) {
          submittedInputs.push(input);
          return { stat: "Ok" };
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const triggerResponse = await app.inject({
      method: "POST",
      url: "/api/orders/sell-sl-limit",
      payload: {
        tradingSymbol: "NIFTY30JAN2030CE",
        quantity: "25",
        triggerPrice: "105",
        amo: "NO",
      },
    });
    const priceResponse = await app.inject({
      method: "POST",
      url: "/api/orders/sell-sl-limit",
      payload: {
        tradingSymbol: "NIFTY30JAN2030CE",
        quantity: "25",
        price: "102.50",
        amo: "NO",
      },
    });

    assert.equal(triggerResponse.statusCode, 200, triggerResponse.body);
    assert.equal(priceResponse.statusCode, 200, priceResponse.body);
    assert.deepEqual(
      submittedInputs.map(({ transactionType, orderType, price, triggerPrice }) => ({
        transactionType,
        orderType,
        price,
        triggerPrice,
      })),
      [
        { transactionType: "S", orderType: "SL", price: "104.90", triggerPrice: "105.00" },
        { transactionType: "S", orderType: "SL", price: "102.50", triggerPrice: "102.60" },
      ],
    );

    const invalidResponse = await app.inject({
      method: "POST",
      url: "/api/orders/sell-sl-limit",
      payload: {
        tradingSymbol: "NIFTY30JAN2030CE",
        quantity: "25",
        triggerPrice: "0.05",
      },
    });
    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(submittedInputs.length, 2);
  });

  it("requires authentication before cancelling an order", async () => {
    let cancelCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async cancelOrder() {
          cancelCalls += 1;
          return { stat: "Ok" };
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/orders/cancel",
      payload: { orderNumber: "2105199703091997" },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(cancelCalls, 0);
  });

  it("validates required orderNumber and AMO tradingSymbol when cancelling", async () => {
    let cancelCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async cancelOrder() {
          cancelCalls += 1;
          return { stat: "Ok" };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });

    const missingOrderNo = await app.inject({
      method: "POST",
      url: "/api/orders/cancel",
      payload: { amo: "NO" },
    });
    assert.equal(missingOrderNo.statusCode, 400);
    assert.match(missingOrderNo.json().error, /orderNumber/);

    const missingAmoSymbol = await app.inject({
      method: "POST",
      url: "/api/orders/cancel",
      payload: { orderNumber: "2105199703091997", amo: "YES" },
    });
    assert.equal(missingAmoSymbol.statusCode, 400);
    assert.match(missingAmoSymbol.json().error, /tradingSymbol/);

    assert.equal(cancelCalls, 0);
  });

  it("cancels an order successfully and forwards parameters", async () => {
    let cancelledSession: AuthenticatedSession | undefined;
    let cancelledInput: unknown;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return { ...authenticatedSession, serverId: "server-id" };
        },
        async cancelOrder(session, input) {
          cancelledSession = session;
          cancelledInput = input;
          return { stat: "Ok", nOrdNo: "2105199703091997", stCode: 200 };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/orders/cancel",
      payload: {
        on: "2105199703091997",
        amo: "NO",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { stat: "Ok", nOrdNo: "2105199703091997", stCode: 200 });
    assert.deepEqual(cancelledSession, { ...authenticatedSession, serverId: "server-id" });
    assert.deepEqual(cancelledInput, {
      orderNumber: "2105199703091997",
      amo: "NO",
    });
  });

  it("cancels an AMO order with tradingSymbol", async () => {
    let cancelledInput: unknown;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async cancelOrder(_session, input) {
          cancelledInput = input;
          return { stat: "Ok", nOrdNo: "2105199703091997", stCode: 200 };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/orders/cancel",
      payload: {
        orderNumber: "2105199703091997",
        amo: "YES",
        tradingSymbol: "TCS-EQ",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(cancelledInput, {
      orderNumber: "2105199703091997",
      amo: "YES",
      tradingSymbol: "TCS-EQ",
    });
  });

  it("requires authentication before requesting historical data", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/market-data/historical?neoSymbol=nse_cm|1333&fromDate=2026-08-20&toDate=2026-09-01&interval=10min",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "Authenticate with Kotak Neo before requesting historical data",
    });
  });

  it("returns 503 when historical data API is unconfigured", async () => {
    const { historicalDataPath: _path, ...kotakWithoutHistorical } = config.kotakNeo;
    const customConfig = { ...config, kotakNeo: kotakWithoutHistorical };

    const app = buildApp({
      config: customConfig as any,
      authClient: {
        async login() {
          return authenticatedSession;
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "GET",
      url: "/api/market-data/historical?neoSymbol=nse_cm|1333&fromDate=2026-08-20&toDate=2026-09-01&interval=10min",
    });

    assert.equal(response.statusCode, 503);
    assert.match(response.json().error, /Kotak Neo historical data API is not configured/);
  });

  it("successfully fetches static Nifty 50 historical candle data for the last 2 days with 10min interval", async () => {
    let capturedInput: unknown;
    const expectedResponse = {
      status: "success",
      interval: "10min",
      data: {
        candles: [
          ["2026-08-20T09:15:00+0530", 12009.9, 12019.35, 12001.25, 12001.5, 163275, 13667775],
        ],
      },
    };

    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async getHistoricalData(_session, input) {
          capturedInput = input;
          return expectedResponse;
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });

    const response = await app.inject({
      method: "GET",
      url: "/api/market-data/historical",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), expectedResponse);
    assert.equal((capturedInput as any).neoSymbol, "nse_cm|26000");
    assert.equal((capturedInput as any).interval, "10min");
    assert.equal(typeof (capturedInput as any).fromDate, "string");
    assert.equal(typeof (capturedInput as any).toDate, "string");
  });

  it("supports compact request with just symbol and defaults dates and interval", async () => {
    let capturedInput: unknown;
    const expectedResponse = {
      status: "success",
      interval: "10min",
      data: { candles: [] },
    };

    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async getHistoricalData(_session, input) {
          capturedInput = input;
          return expectedResponse;
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });

    const response = await app.inject({
      method: "GET",
      url: "/api/market-data/historical?symbol=Nifty%2050",
    });

    assert.equal(response.statusCode, 200);
    assert.equal((capturedInput as any).neoSymbol, "nse_cm|26000");
    assert.equal((capturedInput as any).interval, "10min");
    assert.equal(typeof (capturedInput as any).fromDate, "string");
    assert.equal(typeof (capturedInput as any).toDate, "string");
  });

  it("uses the requested interval when Kotak omits it from the historical response", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async getHistoricalData() {
          return {
            status: "success",
            data: { candles: [] },
          };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });

    const response = await app.inject({
      method: "GET",
      url: "/api/market-data/historical?interval=5min",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().interval, "5min");
  });
});
