import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KotakNeoClient } from "../src/kotak-neo-client.js";

const prodConfig = {
  apiBaseUrl: "https://mis.kotaksecurities.com/",
  consumerKey: "consumer-key",
  financialKey: "test-prod-financial-key",
  totpLoginPath: "login/1.0/tradeApiLogin",
  totpValidatePath: "login/1.0/tradeApiValidate",
  scripMasterPath: "script-details/1.0/masterscrip/file-paths",
  marginPath: "quick/user/check-margin",
  placeOrderPath: "quick/order/rule/ms/place",
  orderSource: "NEOTRADEAPI",
  quotesPath: "script-details/1.0/quotes/neosymbol/{neo_symbols}/{quote_type}",
  requestTimeoutMs: 1000,
};
const testSession = { sid: "test-sid", tradeToken: "test-trade-token" };

describe("KotakNeoClient", () => {
  it("uses the production TOTP response to validate MPIN and returns the trade session", async () => {
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    const client = new KotakNeoClient(prodConfig, async (input, init) => {
      requests.push({ url: new URL(input.toString()), init: init ?? {} });
      const body =
        requests.length === 1
          ? { data: { token: "view-token", sid: "view-sid" } }
          : {
              data: {
                token: "trade-token",
                sid: "trade-sid",
                rid: "request-id",
                hsServerId: "server-id",
                feedUrl: "https://feed.kotaksecurities.com/apifeed",
                baseUrl: "https://neo-gw.kotaksecurities.com/xyz",
              },
            };
      return Response.json(body);
    });

    const session = await client.login({
      mobileNumber: "+919999996708",
      ucc: "TESTUCC",
      totp: "123456",
      mpin: "654321",
    });

    assert.equal(requests.length, 2);
    assert.equal(
      requests[0]?.url.href,
      "https://mis.kotaksecurities.com/login/1.0/tradeApiLogin",
    );
    assert.equal(
      requests[1]?.url.href,
      "https://mis.kotaksecurities.com/login/1.0/tradeApiValidate",
    );

    const firstHeaders = new Headers(requests[0]?.init.headers);
    assert.equal(firstHeaders.get("authorization"), "consumer-key");
    assert.equal(firstHeaders.get("neo-fin-key"), "test-prod-financial-key");
    assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
      mobileNumber: "+919999996708",
      ucc: "TESTUCC",
      totp: "123456",
    });

    const secondHeaders = new Headers(requests[1]?.init.headers);
    assert.equal(secondHeaders.get("content-type"), "application/json");
    assert.equal(secondHeaders.get("sid"), "view-sid");
    assert.equal(secondHeaders.get("auth"), "view-token");
    assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), { mpin: "654321" });

    assert.deepEqual(session, {
      sid: "trade-sid",
      tradeToken: "trade-token",
      baseUrl: "https://neo-gw.kotaksecurities.com/xyz/",
      feedUrl: "https://feed.kotaksecurities.com/apifeed",
      user: "TESTUCC",
      rid: "request-id",
      serverId: "server-id",
    });
  });

  it("uses the TOTP login server ID when validate omits it", async () => {
    let requestCount = 0;
    const client = new KotakNeoClient(prodConfig, async () => {
      requestCount += 1;
      return Response.json({
        data: requestCount === 1
          ? { token: "view-token", sid: "view-sid", hsServerId: "login-server-id" }
          : { token: "trade-token", sid: "trade-sid" },
      });
    });

    const session = await client.login({
      mobileNumber: "+919999996708",
      ucc: "TESTUCC",
      totp: "123456",
      mpin: "654321",
    });

    assert.equal(session.serverId, "login-server-id");
  });

  it("rejects an untrusted baseUrl returned by Kotak login validation", async () => {
    let requestCount = 0;
    const client = new KotakNeoClient(prodConfig, async () => {
      requestCount += 1;
      return Response.json({
        data: requestCount === 1
          ? { token: "view-token", sid: "view-sid" }
          : {
              token: "trade-token",
              sid: "trade-sid",
              baseUrl: "https://attacker.example/proxy",
            },
      });
    });

    await assert.rejects(
      client.login({
        mobileNumber: "+919999996708",
        ucc: "TESTUCC",
        totp: "123456",
        mpin: "654321",
      }),
      /untrusted post-login baseUrl/,
    );
    assert.equal(requestCount, 2);
  });

  it("logs bounded login response fields with session credentials redacted", async () => {
    const logs: Array<{ stage: string; response: unknown }> = [];
    let requestCount = 0;
    const client = new KotakNeoClient(
      prodConfig,
      async () => {
        requestCount += 1;
        return Response.json({
          status: "SUCCESS",
          data:
            requestCount === 1
              ? {
                  token: "view-secret",
                  sid: "view-sid-secret",
                  hsServerId: "view-server-secret",
                  message: "TOTP accepted",
                }
              : {
                  token: "trade-secret",
                  sid: "trade-sid-secret",
                  hsServerId: "trade-server-secret",
                  message: "Login complete",
                },
        });
      },
      undefined,
      (stage, response) => logs.push({ stage, response }),
    );

    await client.login({
      mobileNumber: "+919999996708",
      ucc: "TESTUCC",
      totp: "123456",
      mpin: "654321",
    });

    assert.deepEqual(logs, [
      {
        stage: "totp-login",
        response: {
          status: "SUCCESS",
          data: {
            token: "[REDACTED]",
            sid: "[REDACTED]",
            hsServerId: "[REDACTED]",
            message: "TOTP accepted",
          },
        },
      },
      {
        stage: "totp-validate",
        response: {
          status: "SUCCESS",
          data: {
            token: "[REDACTED]",
            sid: "[REDACTED]",
            hsServerId: "[REDACTED]",
            message: "Login complete",
          },
        },
      },
    ]);
  });

  it("submits a live order using the trading session, base URL, and Kotak order fields", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const client = new KotakNeoClient(prodConfig, async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedInit = init;
      return Response.json({ stat: "Ok", nOrdNo: "order-id" });
    });

    const response = await client.placeNiftyOptionOrder(
      {
        ...testSession,
        serverId: "server-id",
        baseUrl: "https://neo-gw.kotaksecurities.com/xyz/",
      },
      {
        tradingSymbol: "NIFTY30JAN2030CE",
        instrumentToken: "12345",
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
      },
    );

    assert.equal(capturedUrl?.href, "https://neo-gw.kotaksecurities.com/xyz/quick/order/rule/ms/place?sId=server-id");
    assert.equal(capturedInit?.method, "POST");
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("auth"), "test-trade-token");
    assert.equal(headers.get("sid"), "test-sid");
    assert.equal(headers.get("neo-fin-key"), "test-prod-financial-key");
    assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(capturedInit?.body));
    assert.deepEqual([...body.keys()], ["jData"]);
    assert.deepEqual(JSON.parse(body.get("jData") ?? "null"), {
      am: "NO",
      dq: "0",
      es: "nse_fo",
      mp: "0",
      pc: "MIS",
      pf: "N",
      pr: "100",
      pt: "L",
      qt: "50",
      rt: "DAY",
      tp: "0",
      ts: "NIFTY30JAN2030CE",
      tt: "B",
      os: "NEOTRADEAPI",
      ig: "test-order",
    });
    assert.deepEqual(response, { stat: "Ok", nOrdNo: "order-id" });
  });

  it("submits using the documented trading session when hsServerId is omitted", async () => {
    let capturedUrl: URL | undefined;
    let capturedHeaders: Headers | undefined;
    const clientWithCapture = new KotakNeoClient(prodConfig, async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedHeaders = new Headers(init?.headers);
      return Response.json({ stat: "Ok" });
    });

    const response = await clientWithCapture.placeNiftyOptionOrder({
      ...testSession,
      baseUrl: "https://neo-gw.kotaksecurities.com/api/",
    }, {
      tradingSymbol: "NIFTY30JAN2030CE",
      instrumentToken: "12345",
      transactionType: "B",
      quantity: "25",
      product: "MIS",
      orderType: "MKT",
      price: "0",
      validity: "DAY",
      amo: "NO",
      disclosedQuantity: "0",
      marketProtection: "0",
      triggerPrice: "0",
    });

    assert.equal(capturedUrl?.href, "https://neo-gw.kotaksecurities.com/api/quick/order/rule/ms/place");
    assert.equal(capturedUrl?.searchParams.has("sId"), false);
    assert.equal(capturedHeaders?.get("auth"), "test-trade-token");
    assert.equal(capturedHeaders?.get("sid"), "test-sid");
    assert.deepEqual(response, { stat: "Ok" });
  });

  it("includes the documented bracket-order fields and scrip token", async () => {
    let capturedInit: RequestInit | undefined;
    const client = new KotakNeoClient(prodConfig, async (_input, init) => {
      capturedInit = init;
      return Response.json({ stat: "Ok", nOrdNo: "order-id" });
    });

    await client.placeNiftyOptionOrder(testSession, {
      tradingSymbol: "NIFTY30JAN2030CE",
      instrumentToken: "12345",
      transactionType: "B",
      quantity: "25",
      product: "BO",
      orderType: "L",
      price: "100",
      validity: "DAY",
      amo: "NO",
      disclosedQuantity: "0",
      marketProtection: "0",
      triggerPrice: "0",
      squareOffType: "Ticks",
      stopLossType: "Ticks",
      stopLossValue: "20",
      squareOffValue: "40",
      trailingStopLoss: "Y",
      trailingSlValue: "5",
    });

    const form = new URLSearchParams(String(capturedInit?.body));
    const orderData = JSON.parse(form.get("jData") ?? "null");
    assert.deepEqual(
      {
        pc: orderData.pc,
        tk: orderData.tk,
        sot: orderData.sot,
        slt: orderData.slt,
        slv: orderData.slv,
        sov: orderData.sov,
        tlt: orderData.tlt,
        tsv: orderData.tsv,
      },
      {
        pc: "BO",
        tk: "12345",
        sot: "Ticks",
        slt: "Ticks",
        slv: "20",
        sov: "40",
        tlt: "Y",
        tsv: "5",
      },
    );
  });

  it("submits an order cancellation request with correct headers and payload", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const client = new KotakNeoClient(
      { ...prodConfig, cancelOrderPath: "quick/order/cancel" },
      async (input, init) => {
        capturedUrl = new URL(input.toString());
        capturedInit = init;
        return Response.json({ stat: "Ok", nOrdNo: "2105199703091997", stCode: 200 });
      },
    );

    const response = await client.cancelOrder(
      {
        ...testSession,
        serverId: "server-id",
        baseUrl: "https://neo-gw.kotaksecurities.com/xyz/",
      },
      {
        orderNumber: "2105199703091997",
        amo: "NO",
      },
    );

    assert.equal(
      capturedUrl?.href,
      "https://neo-gw.kotaksecurities.com/xyz/quick/order/cancel?sId=server-id",
    );
    assert.equal(capturedInit?.method, "POST");
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("auth"), "test-trade-token");
    assert.equal(headers.get("sid"), "test-sid");
    assert.equal(headers.get("neo-fin-key"), "test-prod-financial-key");
    assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(capturedInit?.body));
    assert.deepEqual(JSON.parse(body.get("jData") ?? "null"), {
      am: "NO",
      on: "2105199703091997",
    });
    assert.deepEqual(response, { stat: "Ok", nOrdNo: "2105199703091997", stCode: 200 });
  });

  it("submits an AMO order cancellation request with trading symbol", async () => {
    let capturedInit: RequestInit | undefined;
    const client = new KotakNeoClient(
      { ...prodConfig, cancelOrderPath: "quick/order/cancel" },
      async (_input, init) => {
        capturedInit = init;
        return Response.json({ stat: "Ok", nOrdNo: "2105199703091997", stCode: 200 });
      },
    );

    await client.cancelOrder(testSession, {
      orderNumber: "2105199703091997",
      amo: "YES",
      tradingSymbol: "TCS-EQ",
    });

    const body = new URLSearchParams(String(capturedInit?.body));
    assert.deepEqual(JSON.parse(body.get("jData") ?? "null"), {
      am: "YES",
      on: "2105199703091997",
      ts: "TCS-EQ",
    });
  });

  it("throws KotakNeoError when cancelOrderPath is missing", async () => {
    const client = new KotakNeoClient(prodConfig);

    await assert.rejects(
      client.cancelOrder(testSession, { orderNumber: "12345" }),
      /Kotak Neo cancel order API is not configured/,
    );
  });

  it("submits a request for historical candle data with expected parameters and headers", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;

    const mockResponse = {
      status: "success",
      interval: "10min",
      data: {
        candles: [
          ["2026-08-20T09:15:00+0530", 12009.9, 12019.35, 12001.25, 12001.5, 163275, 13667775],
        ],
      },
    };

    const client = new KotakNeoClient(
      { ...prodConfig, historicalDataPath: "market-data/1.0/historical/details" },
      async (input, init) => {
        capturedUrl = new URL(input.toString());
        capturedInit = init;
        return Response.json(mockResponse);
      },
    );

    const result = await client.getHistoricalData(testSession, {
      neoSymbol: "nse_cm|1333",
      fromDate: "2026-08-20",
      toDate: "2026-09-01",
      interval: "10min",
    });

    assert.equal(capturedUrl?.pathname, "/market-data/1.0/historical/details");
    assert.equal(capturedUrl?.searchParams.get("neosymbol"), "nse_cm|1333");
    assert.equal(capturedUrl?.searchParams.get("fromdate"), "2026-08-20");
    assert.equal(capturedUrl?.searchParams.get("todate"), "2026-09-01");
    assert.equal(capturedUrl?.searchParams.get("interval"), "10min");
    assert.equal(capturedInit?.method, "GET");

    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("authorization"), "consumer-key");
    assert.equal(headers.get("content-type"), "application/json");

    assert.deepEqual(result, mockResponse);
  });

  it("handles Kotak Neo historical data error response", async () => {
    const client = new KotakNeoClient(
      { ...prodConfig, historicalDataPath: "market-data/1.0/historical/details" },
      async () => {
        return Response.json({
          status: "ERROR",
          fault: {
            code: 400,
            message: "Invalid interval value",
          },
        });
      },
    );

    await assert.rejects(
      client.getHistoricalData(testSession, {
        neoSymbol: "nse_cm|1333",
        fromDate: "2026-08-20",
        toDate: "2026-09-01",
        interval: "invalid",
      }),
      (error: unknown) => {
        return (
          error instanceof Error &&
          error.message.includes("Invalid interval value") &&
          (error as any).statusCode === 400
        );
      },
    );
  });

  it("throws KotakNeoError when historicalDataPath is missing", async () => {
    const { historicalDataPath: _path, ...configWithoutHistoricalPath } = prodConfig;
    const client = new KotakNeoClient(configWithoutHistoricalPath as any);

    await assert.rejects(
      client.getHistoricalData(testSession, {
        neoSymbol: "nse_cm|1333",
        fromDate: "2026-08-20",
        toDate: "2026-09-01",
        interval: "10min",
      }),
      /Kotak Neo historical data API is not configured/,
    );
  });
});
