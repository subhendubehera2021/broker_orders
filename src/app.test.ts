import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { KotakNeoError, type AuthenticatedSession } from "./kotak-neo-client.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 3000,
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

describe("authentication routes", () => {
  it("serves the login page without caching it", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject("/");

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /Registered mobile number/);
    assert.match(response.body, /Authenticator code/);
    assert.match(response.body, /value="\+910000000000" readonly/);
    assert.match(response.body, /value="TESTUCC" readonly/);
    assert.doesNotMatch(response.body, /654321/);
    assert.doesNotMatch(response.body, /name="mpin"/);
    assert.match(response.body, /href="\/margin">Open margin calculator/);
    assert.match(response.body, /href="\/option-chain">Open NIFTY option chain/);
    assert.doesNotMatch(response.body, /id="margin-form"/);
    assert.match(response.body, /fetch\("\/api\/auth\/login"/);
  });

  it("serves the margin calculator on its own uncached route", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject("/margin");

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /<h1>Margin calculator<\/h1>/);
    assert.match(response.body, /id="margin-form" hidden/);
    assert.match(response.body, /fetch\("\/api\/margin"/);
    assert.match(response.body, /Go to sign in/);
  });

  it("serves the separate NSE F&O Scrip Master page", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject("/scrip-master");

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /NSE F&amp;O Scrip Master/);
    assert.match(response.body, /\/api\/scrip-master\/nse-fo/);
    assert.match(response.body, /Search all instrument fields/);
  });

  it("serves the separate NIFTY option-chain page", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject("/option-chain");

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /<h1>NIFTY option chain<\/h1>/);
    assert.match(response.body, /\/api\/options\/nifty\/expiries/);
    assert.match(response.body, /\/api\/options\/nifty\/chain/);
    assert.match(response.body, /option prices are not loaded/);
    assert.match(response.body, /api\/market\/nifty\/stream/);
    assert.doesNotMatch(response.body, /Refresh quotes|>LTP</);
  });

  it("serves Swagger UI and an OpenAPI document for the API routes", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const uiResponse = await app.inject("/docs/");
    assert.equal(uiResponse.statusCode, 200);
    assert.match(String(uiResponse.headers["content-type"] ?? ""), /text\/html/);

    const specResponse = await app.inject("/docs/json");
    assert.equal(specResponse.statusCode, 200);
    const spec = specResponse.json();
    assert.equal(spec.openapi, "3.0.3");
    assert.deepEqual(Object.keys(spec.paths).sort(), [
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/session",
      "/api/margin",
      "/api/market/nifty/stream",
      "/api/options/nifty/chain",
      "/api/options/nifty/expiries",
      "/api/scrip-master",
      "/api/scrip-master/nse-fo",
      "/health",
    ]);
    assert.equal(
      spec.paths["/api/auth/login"].post.requestBody.content["application/json"].schema.required.includes(
        "totp",
      ),
      true,
    );
    const loginSchema = spec.paths["/api/auth/login"].post.requestBody.content["application/json"].schema;
    assert.deepEqual(loginSchema.required, ["totp"]);
    assert.deepEqual(Object.keys(loginSchema.properties), ["totp"]);
    assert.deepEqual(
      spec.paths["/api/margin"].post.requestBody.content["application/json"].schema.required,
      ["brkName", "brnchId", "exSeg", "prc", "prcTp", "prod", "qty", "tok", "trnsTp"],
    );
  });

  it("completes login without returning broker tokens", async () => {
    let loginCount = 0;
    const app = buildApp({
      config,
      authClient: {
        async login(input) {
          loginCount += 1;
          assert.deepEqual(input, {
            mobileNumber: "+910000000000",
            ucc: "TESTUCC",
            mpin: "654321",
            totp: "123456",
          });
          return authenticatedSession;
        },
        async getScripMaster() {
          return { data: { filesPaths: ["https://files.example/scrip-master.zip"] } };
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { authenticated: true });
    assert.equal(loginCount, 1);
    assert.equal(response.body.includes("private-trade-token"), false);

    const sessionResponse = await app.inject("/api/auth/session");
    assert.deepEqual(sessionResponse.json(), {
      authenticated: true,
    });
    assert.equal(sessionResponse.body.includes("private-sid"), false);
  });

  it("rejects malformed credentials before calling the broker", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() {
          assert.fail("login should not be called for invalid credentials");
        },
        async getScripMaster() {
          return { data: { filesPaths: [] } };
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "not-a-totp" },
    });

    assert.equal(response.statusCode, 400);
  });

  it("clears session state on logout", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
      },
    });
    apps.push(app);

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });
    const logoutResponse = await app.inject({ method: "POST", url: "/api/auth/logout" });

    assert.deepEqual(logoutResponse.json(), { authenticated: false });
    assert.deepEqual((await app.inject("/api/auth/session")).json(), {
      authenticated: false,
    });
  });

  it("reports missing broker configuration without attempting login", async () => {
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: { ...config.kotakNeo, consumerKey: undefined },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "Kotak Neo login settings are not configured",
    });
  });

  it("does not authenticate if server-side MPIN is missing", async () => {
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: { ...config.kotakNeo, mpin: undefined },
      },
      authClient: {
        async login() {
          assert.fail("login should not be called without configured credentials");
        },
        async getScripMaster() {
          return { data: { filesPaths: [] } };
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "Kotak Neo login settings are not configured",
    });
  });

  it("proxies Scrip Master data without exposing the configured API token", async () => {
    let requestCount = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          return authenticatedSession;
        },
        async getScripMaster() {
          requestCount += 1;
          return { data: { filesPaths: ["https://files.example/scrip-master.zip"] } };
        },
      },
    });
    apps.push(app);

    const response = await app.inject("/api/scrip-master");

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      data: { filesPaths: ["https://files.example/scrip-master.zip"] },
    });
    assert.equal(response.body.includes("test-consumer-key"), false);
    assert.equal(requestCount, 1);
  });

  it("serves the NSE F&O CSV through the Scrip Master API", async () => {
    const csv = "token,symbol\n12345,NIFTY\n";
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getNseFoScripMaster() { return csv; },
      },
    });
    apps.push(app);

    const response = await app.inject("/api/scrip-master/nse-fo");

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/csv/);
    assert.match(String(response.headers["content-disposition"] ?? ""), /nse_fo\.csv/);
    assert.equal(response.body, csv);
  });

  it("returns a useful Scrip Master download error without exposing upstream response data", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getNseFoScripMaster() {
          throw new KotakNeoError("Kotak Neo did not provide the NSE F&O Scrip Master file", 502);
        },
      },
    });
    apps.push(app);

    const response = await app.inject("/api/scrip-master/nse-fo");

    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), {
      error: "Kotak Neo did not provide the NSE F&O Scrip Master file",
    });
  });

  it("returns NIFTY option expiries without a broker session", async () => {
    let masterCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getNseFoScripMaster() { masterCalls += 1; return ""; },
      },
      optionChainCsvLoader: async () => [
        "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;",
        `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${Date.UTC(2030, 0, 30) / 1000 - 315_511_200},2500000`,
      ].join("\n"),
    });
    apps.push(app);

    const response = await app.inject("/api/options/nifty/expiries");

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { expiries: ["30JAN2030"] });
    assert.equal(masterCalls, 0);
  });

  it("loads option expiries from the local NSE F&O file instead of downloading it", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getNseFoScripMaster() {
          assert.fail("option chain must use the local CSV, not download the Scrip Master");
        },
      },
    });
    apps.push(app);

    const response = await app.inject("/api/options/nifty/expiries");

    assert.equal(response.statusCode, 200);
    assert.ok(response.json().expiries.length > 0);
  });

  it("returns local NIFTY contract details without requesting quotes", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000,25`,
      `124,OPTIDX,NIFTY,NIFTY30JAN2030PE,PE,${expiryEpoch},2500000,25`,
      `125,OPTIDX,BANKNIFTY,BANKNIFTY30JAN2030CE,CE,${expiryEpoch},2500000,15`,
    ].join("\n");
    let remoteMasterCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getNseFoScripMaster() { remoteMasterCalls += 1; return csv; },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    const expiriesResponse = await app.inject("/api/options/nifty/expiries");
    const chainResponse = await app.inject("/api/options/nifty/chain?expiry=30JAN2030");

    assert.equal(expiriesResponse.statusCode, 200);
    assert.deepEqual(expiriesResponse.json(), { expiries: ["30JAN2030"] });
    assert.equal(chainResponse.statusCode, 200);
    assert.equal(remoteMasterCalls, 0);
    assert.deepEqual(chainResponse.json(), {
      expiry: "30JAN2030",
      contracts: [
        {
          instrumentToken: "123",
          tradingSymbol: "NIFTY30JAN2030CE",
          optionType: "CE",
          strike: 25000,
          expiry: "30JAN2030",
          lotSize: "25",
        },
        {
          instrumentToken: "124",
          tradingSymbol: "NIFTY30JAN2030PE",
          optionType: "PE",
          strike: 25000,
          expiry: "30JAN2030",
          lotSize: "25",
        },
      ],
    });
  });

  it("requires authentication before opening the NIFTY live-price stream", async () => {
    let streamRequests = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        streamNiftyIndexPrice() {
          streamRequests += 1;
          return () => {};
        },
      },
    });
    apps.push(app);

    const unauthorized = await app.inject("/api/market/nifty/stream");
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(streamRequests, 0);
  });

  it("relays live index ticks to the page as server-sent events", async () => {
    let streamStopped = false;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        streamNiftyIndexPrice(_session, onPrice, onError) {
          onPrice({ price: 24250.75, asOf: "2030-01-30T10:00:00.000Z" });
          onError(new Error("Kotak market-data WebSocket disconnected"));
          return () => { streamStopped = true; };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject("/api/market/nifty/stream");

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/event-stream/);
    assert.match(response.body, /event: price\ndata: \{"price":24250\.75,"asOf":"2030-01-30T10:00:00\.000Z"\}/);
    assert.match(response.body, /event: market-error/);
    assert.equal(streamStopped, true);
  });

  it("returns HTTP 400 when the selected expiry has no NIFTY contracts", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000`,
    ].join("\n");
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    const response = await app.inject("/api/options/nifty/chain?expiry=31JAN2030");

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "No NIFTY option contracts found for that expiry",
    });
  });

  it("requires an authenticated broker session before checking margin", async () => {
    let marginCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async checkMargin() {
          marginCalls += 1;
          return { data: { margin: "12500.00" } };
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/margin",
      payload: marginInput,
    });

    assert.equal(response.statusCode, 401);
    assert.equal(marginCalls, 0);
  });

  it("checks margin with the active session and the supplied order parameters", async () => {
    let receivedSession: AuthenticatedSession | undefined;
    let receivedInput: unknown;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async checkMargin(session, input) {
          receivedSession = session;
          receivedInput = input;
          return { data: { margin: "12500.00" } };
        },
      },
    });
    apps.push(app);

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/margin",
      payload: marginInput,
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { data: { margin: "12500.00" } });
    assert.deepEqual(receivedSession, authenticatedSession);
    assert.deepEqual(receivedInput, marginInput);
    assert.equal(response.body.includes("private-trade-token"), false);
  });

  it("rejects invalid margin input before calling the broker", async () => {
    let marginCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async checkMargin() {
          marginCalls += 1;
          return {};
        },
      },
    });
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { totp: "123456" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/margin",
      payload: { ...marginInput, trnsTp: "BUY" },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(marginCalls, 0);
  });
});

const marginInput = {
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
