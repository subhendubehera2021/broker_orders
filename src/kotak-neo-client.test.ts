import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KotakNeoClient } from "./kotak-neo-client.js";

const prodConfig = {
  apiBaseUrl: "https://mis.kotaksecurities.com/",
  consumerKey: "consumer-key",
  financialKey: "test-prod-financial-key",
  totpLoginPath: "login/1.0/tradeApiLogin",
  totpValidatePath: "login/1.0/tradeApiValidate",
  scripMasterPath: "script-details/1.0/masterscrip/file-paths",
  marginPath: "quick/user/check-margin",
  quotesPath: "script-details/1.0/quotes/neosymbol/{neo_symbols}/{quote_type}",
  requestTimeoutMs: 1000,
};

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
      rid: "request-id",
      serverId: "server-id",
    });
  });

  it("fetches Scrip Master paths with an authorization header", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const client = new KotakNeoClient(prodConfig, async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedInit = init;
      return Response.json({
        data: { filesPaths: ["https://files.example/scrip-master.zip"] },
      });
    });

    const response = await client.getScripMaster();

    assert.equal(
      capturedUrl?.href,
      "https://mis.kotaksecurities.com/script-details/1.0/masterscrip/file-paths",
    );
    assert.equal(capturedInit?.method, "GET");
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("authorization"), "consumer-key");
    assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded");
    assert.deepEqual(response, {
      data: { filesPaths: ["https://files.example/scrip-master.zip"] },
    });
  });

  it("downloads the NSE F&O CSV from the official Scrip Master host", async () => {
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    const csv = "token,symbol\n12345,NIFTY\n";
    const client = new KotakNeoClient(prodConfig, async (input, init) => {
      const url = new URL(input.toString());
      requests.push({ url, init: init ?? {} });
      if (url.pathname.endsWith("/file-paths")) {
        return Response.json({
          data: {
            filesPaths: [
              "https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/today/transformed/nse_fo.csv",
            ],
          },
        });
      }
      return new Response(csv, { headers: { "content-type": "text/csv" } });
    });

    assert.equal(await client.getNseFoScripMaster(), csv);
    assert.equal(requests.length, 2);
    assert.equal(
      requests[1]?.url.href,
      "https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/today/transformed/nse_fo.csv",
    );
    assert.equal(requests[1]?.init.method, "GET");
  });

  it("accepts an NSE F&O Scrip Master larger than the previous 25 MiB limit", async () => {
    const largeFile = new Uint8Array(26 * 1024 * 1024).fill(65);
    const client = new KotakNeoClient(prodConfig, async (input) => {
      const url = new URL(input.toString());
      if (url.pathname.endsWith("/file-paths")) {
        return Response.json({
          data: {
            filesPaths: [
              "https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/today/transformed/nse_fo.csv",
            ],
          },
        });
      }
      return new Response(largeFile, {
        headers: { "content-length": String(largeFile.byteLength) },
      });
    });

    const csv = await client.getNseFoScripMaster();

    assert.equal(csv.length, largeFile.byteLength);
    assert.equal(csv[0], "A");
    assert.equal(csv.at(-1), "A");
  });

  it("rejects Scrip Master download URLs outside the official host", async () => {
    let requestCount = 0;
    const client = new KotakNeoClient(prodConfig, async () => {
      requestCount += 1;
      return Response.json({
        data: { filesPaths: ["https://attacker.example/nse_fo.csv"] },
      });
    });

    await assert.rejects(client.getNseFoScripMaster(), /untrusted NSE F&O file URL/);
    assert.equal(requestCount, 1);
  });

  it("posts margin parameters as jData with the authenticated session headers", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const client = new KotakNeoClient(prodConfig, async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedInit = init;
      return Response.json({ data: { margin: "12500.00" } });
    });

    const input = {
      brkName: "KOTAK",
      brnchId: "ONLINE",
      exSeg: "nse_cm",
      prc: "12500",
      prcTp: "L",
      prod: "CNC",
      qty: "1",
      tok: "11536",
      trnsTp: "B",
    };
    const response = await client.checkMargin(
      { sid: "session-sid", tradeToken: "session-token" },
      input,
    );

    assert.equal(
      capturedUrl?.href,
      "https://mis.kotaksecurities.com/quick/user/check-margin",
    );
    assert.equal(capturedInit?.method, "POST");
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("auth"), "session-token");
    assert.equal(headers.get("sid"), "session-sid");
    assert.equal(headers.get("neo-fin-key"), "test-prod-financial-key");
    assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(capturedInit?.body));
    assert.deepEqual(JSON.parse(body.get("jData") ?? "null"), input);
    assert.deepEqual(response, { data: { margin: "12500.00" } });
  });

  it("requests quotes for encoded NIFTY option tokens", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const quoteResponse = { message: [{ tk: "123", ltp: "120.5" }] };
    const client = new KotakNeoClient(prodConfig, async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedInit = init;
      return Response.json(quoteResponse);
    });

    const result = await client.getQuotes(
      [
        { instrumentToken: "123", exchangeSegment: "nse_fo" },
        { instrumentToken: "456", exchangeSegment: "nse_fo" },
      ],
      "all",
    );

    assert.equal(
      capturedUrl?.href,
      "https://mis.kotaksecurities.com/script-details/1.0/quotes/neosymbol/nse_fo%7C123%2Cnse_fo%7C456/all",
    );
    assert.equal(capturedInit?.method, "GET");
    assert.equal(new Headers(capturedInit?.headers).get("authorization"), "consumer-key");
    assert.deepEqual(result, quoteResponse);
  });

  it("includes the upstream HTTP status when Kotak rejects a quote request", async () => {
    const client = new KotakNeoClient(prodConfig, async () =>
      Response.json(
        { error: [{ code: "10300", message: "Invalid quote type" }] },
        { status: 400 },
      ),
    );

    await assert.rejects(
      client.getQuotes([{ instrumentToken: "123", exchangeSegment: "nse_fo" }]),
      /Kotak Neo rejected the API request \(HTTP 400\): Invalid quote type/,
    );
  });
});
