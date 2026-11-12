import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import {
  KotakNeoError,
  type AuthenticatedSession,
  type PlaceNiftyOptionOrderInput,
} from "./kotak-neo-client.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 3000,
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

async function frontendAccessCookie(
  app: FastifyInstance,
  next = "/",
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/access/unlock",
    payload: { passcode: "SKB9178", next },
  });
  assert.equal(response.statusCode, 200, response.body);
  const setCookie = response.headers["set-cookie"];
  assert.ok(setCookie);
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookie?.split(";")[0] ?? "";
}

describe("authentication routes", () => {
  it("serves the passcode form and redirects locked frontend pages to it", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const page = await app.inject("/access");
    const locked = await app.inject("/option-chain?expiry=05NOV2026");

    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Enter access passcode/);
    assert.match(page.body, /\/api\/access\/unlock/);
    assert.equal(locked.statusCode, 303);
    assert.equal(
      locked.headers.location,
      `/access?next=${encodeURIComponent("/option-chain?expiry=05NOV2026")}`,
    );
    assert.equal((await app.inject("/health")).statusCode, 200);
  });

  it("unlocks frontend pages using the configured passcode until midnight", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const cookie = await frontendAccessCookie(app, "/orders");
    const response = await app.inject({ url: "/orders", headers: { cookie } });
    const setCookie = await app.inject({
      method: "POST",
      url: "/api/access/unlock",
      payload: {
        passcode: "SKB9178",
        next: "//example.com",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<h1>Orders<\/h1>/);
    assert.match(setCookie.json().redirectTo, /^\//);
    const post = await app.inject({
      method: "POST",
      url: "/api/access/unlock",
      payload: {
        passcode: "SKB9178",
      },
    });
    assert.match(String(post.headers["set-cookie"]), /Expires=/);
    assert.match(String(post.headers["set-cookie"]), /HttpOnly/);
    assert.match(String(post.headers["set-cookie"]), /SameSite=Strict/);
  });

  it("rejects incorrect frontend passcodes without setting an access cookie", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/access/unlock",
      payload: {
        passcode: "SKB9179",
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /Incorrect passcode/);
    assert.equal(response.headers["set-cookie"], undefined);
  });

  it("serves the login page without caching it", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const cookie = await frontendAccessCookie(app);
    const response = await app.inject({ url: "/", headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /Registered mobile number/);
    assert.match(response.body, /Authenticator code/);
    assert.match(response.body, /value="\+910000000000" readonly/);
    assert.match(response.body, /Sign-in submits automatically after six digits/);
    assert.match(response.body, /digits\.length === 6 && !submitButton\.disabled\) form\.requestSubmit\(\)/);
    assert.match(response.body, /value="TESTUCC" readonly/);
    assert.doesNotMatch(response.body, /654321/);
    assert.doesNotMatch(response.body, /name="mpin"/);
    assert.match(response.body, /href="\/margin">Open margin calculator/);
    assert.match(response.body, /href="\/option-chain">Open NIFTY option chain/);
    assert.match(response.body, /href="\/orders">View open and closed orders/);
    assert.match(response.body, /href="\/order-stream">View live order and position updates/);
    assert.match(response.body, /href="\/auto-trade">Analyze liquidity swings/);
    assert.doesNotMatch(response.body, /id="margin-form"/);
    assert.match(response.body, /fetch\("\/api\/auth\/login"/);
  });

  it("serves the margin calculator on its own uncached route", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const cookie = await frontendAccessCookie(app);
    const response = await app.inject({ url: "/margin", headers: { cookie } });

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

    const cookie = await frontendAccessCookie(app);
    const response = await app.inject({ url: "/scrip-master", headers: { cookie } });

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

    const cookie = await frontendAccessCookie(app);
    const response = await app.inject({ url: "/option-chain", headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.doesNotMatch(response.body, /<h1>NIFTY option chain<\/h1>/);
    assert.match(response.body, /\/api\/options\/nifty\/expiries/);
    assert.match(response.body, /\/api\/options\/nifty\/chain/);
    assert.match(response.body, /<h2>Open orders<\/h2>/);
    assert.match(response.body, /id="live-activity" aria-label="Live order updates"/);
    assert.match(response.body, /id="activity-stream-status"/);
    assert.match(response.body, /id="activity-auto-sell-status"/);
    assert.match(response.body, /id="activity-order-updates"/);
    assert.match(response.body, /id="activity-position-updates"/);
    assert.match(response.body, /new EventSource\("\/api\/orders\/stream"\)/);
    assert.match(response.body, /addEventListener\("auto-sell"/);
    assert.match(response.body, /Auto-sell: after full fill, place an SL-limit SELL 5 points below the average fill price/);
    assert.match(response.body, /fetch\("\/api\/positions"/);
    assert.match(response.body, /void connectActivityStream\(\)/);
    assert.match(response.body, /href="#live-activity">Live activity<\/a>/);
    assert.match(response.body, /id="refresh-open-orders"/);
    assert.match(response.body, /aria-label="Refresh orders" title="Refresh orders"/);
    assert.match(response.body, /aria-label="Closed orders"/);
    assert.match(response.body, /<h2>Closed orders<\/h2>/);
    assert.match(response.body, /id="closed-orders-status"/);
    assert.match(response.body, /id="closed-order-rows"/);
    assert.match(response.body, /function isClosedOrder\(order\)/);
    assert.match(response.body, /renderClosedOrders\(orders\)/);
    assert.match(response.body, /closedOrders\.sort\(\(left, right\)/);
    assert.match(response.body, /function orderTimestamp\(order\)/);
    assert.match(response.body, /<th>Sell qty<\/th><th>LTP<\/th><th>Average entry<\/th><th>Live P\/L<\/th>/);
    assert.match(response.body, /function activeActivityPositions\(\)/);
    assert.match(response.body, /activityPositionNetQuantity\(position\) !== 0/);
    assert.match(response.body, /\(ltp - averageEntryPrice\) \* netQuantity/);
    assert.match(response.body, /getTrackedPriceSymbols\(\)/);
    assert.ok(
      response.body.indexOf('aria-label="Active position P/L"') >
        response.body.indexOf('aria-label="Open orders"'),
    );
    assert.ok(
      response.body.indexOf('aria-label="NIFTY option chain"') >
        response.body.indexOf('aria-label="Active position P/L"'),
    );
    assert.ok(
      response.body.indexOf('aria-label="Closed orders"') >
        response.body.indexOf('aria-label="Live position updates"'),
    );
    assert.doesNotMatch(response.body, /aria-label="Filled trade P\/L"/);
    assert.match(response.body, /class="panel orders-panel"/);
    assert.match(response.body, /open-orders-table \{ min-width: 780px; font-size: 12px; \}/);
    assert.match(response.body, /<th scope="col">Select<\/th>/);
    assert.match(response.body, /selector\.type = "radio"/);
    assert.match(response.body, /selector\.name = "selected-open-order"/);
    assert.match(response.body, /selector\.checked = index === 0/);
    assert.match(response.body, /input\[type="radio"\]:checked::before/);
    assert.match(response.body, /input\[type="radio"\]:focus-visible/);
    assert.match(response.body, /↑ \+₹0\.05 · ↓ −₹0\.05 · → cancel/);
    assert.match(response.body, /window\.addEventListener\("keydown"/);
    assert.match(response.body, /event\.key === "ArrowUp"/);
    assert.match(response.body, /event\.key === "ArrowDown"/);
    assert.match(response.body, /event\.keyCode === 38/);
    assert.match(response.body, /event\.keyCode === 40/);
    assert.match(response.body, /input\[name="selected-open-order"\]:checked/);
    assert.match(response.body, /void cancelOpenOrder\(selectedRadio\.value\)/);
    assert.match(response.body, /void adjustOpenOrderPrice\(/);
    assert.match(response.body, /price: \(priceTicks \/ 20\)\.toFixed\(2\)/);
    assert.match(response.body, /triggerPrice: isStopLimit \? \(triggerTicks \/ 20\)\.toFixed\(2\) : "0"/);
    assert.match(response.body, /\/api\/orders\/" \+ encodeURIComponent\(orderNumber\) \+ "\/modify/);
    assert.doesNotMatch(response.body, /focusedRadio === selectedRadio/);
    assert.doesNotMatch(response.body, /window\.alert/);
    assert.match(response.body, /fetch\("\/api\/orders"/);
    assert.match(response.body, /openOrderRows\.append\(row\)/);
    assert.match(response.body, /open-order-actions/);
    assert.match(response.body, /function createOpenOrderAction\(label, action\)/);
    assert.match(response.body, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/);
    assert.match(response.body, /button\.title = label/);
    assert.match(response.body, /actionButtons\.append\(modifyButton\)/);
    assert.match(response.body, /actionButtons\.append\(cancelButton\)/);
    assert.match(response.body, /Modify order/);
    assert.match(response.body, /\/api\/orders\/" \+ encodeURIComponent\(modifyingOrderNumber\) \+ "\/modify/);
    assert.match(response.body, /instrumentToken: modifyingOrderContext\.instrumentToken/);
    assert.match(response.body, /instrumentToken: orderValue\(order, \["tk", "tok", "instrumentToken", "instrument_token"\], ""\)/);
    assert.match(response.body, /Review & modify live order/);
    assert.match(response.body, /async function cancelOpenOrder\(orderNumber\)/);
    assert.doesNotMatch(response.body, /confirm\("Cancel open order/);
    assert.match(response.body, /\/api\/orders\/" \+ encodeURIComponent\(orderNumber\) \+ "\/cancel/);
    assert.ok(
      response.body.indexOf('aria-label="Open orders"') <
        response.body.indexOf('aria-label="NIFTY option chain"'),
    );
    assert.ok(
      response.body.indexOf('aria-label="NIFTY option chain"') <
        response.body.indexOf('id="live-activity" aria-label="Live order updates"'),
    );
    assert.match(response.body, /Reconnect<\/button>/);
    assert.match(response.body, /spotPrice\.id = "nifty-spot-price"/);
    assert.match(response.body, /spotRow\.className = "spot-row"/);
    assert.match(response.body, /button\.textContent = "BUY"/);
    assert.match(response.body, /swingButton\.textContent = "SW"/);
    assert.match(response.body, /id="swing-dialog"/);
    assert.match(response.body, /<h2 id="swing-title">Liquidity swings<\/h2>/);
    assert.match(response.body, /id="swing-ltp" aria-live="polite">LTP unavailable/);
    assert.match(response.body, /selectedSwingContract\?\.tradingSymbol === tick\.tradingSymbol/);
    assert.match(response.body, /updateSwingLtp\(tick\.price\)/);
    assert.match(response.body, /<option value="5" selected>5 candles<\/option>/);
    assert.match(response.body, /<option value="high" selected>Swing high<\/option>/);
    assert.match(response.body, /void openSwingModal\(contract\)/);
    assert.match(response.body, /await loadContractSwings\(\)/);
    assert.match(response.body, /pivotLookback: swingLookbackSelect\.value/);
    assert.match(response.body, /api\/auto-trade\/liquidity-swings/);
    assert.match(response.body, /<th>Action<\/th>/);
    assert.match(response.body, /buyButton\.textContent = "BUY"/);
    assert.match(response.body, /void placeSwingBuyOrder\(contract, swing, orderKey, buyButton\)/);
    assert.match(response.body, /quantity: "65"/);
    assert.match(response.body, /product: "MIS"/);
    assert.match(response.body, /orderType: "SL"/);
    assert.match(response.body, /triggerPrice: String\(price\)/);
    assert.match(response.body, /fetch\("\/api\/options\/nifty\/order"/);
    assert.match(response.body, /button\.disabled = orderSubmissionUncertain/);
    assert.match(response.body, /\.option-row:hover \.buy-button, \.option-row:focus-within \.buy-button \{ opacity: \.9; pointer-events: auto; \}/);
    assert.match(response.body, /orderDialog\.showModal\(\)/);
    assert.match(response.body, /Place BUY order/);
    assert.match(response.body, /id="order-ltp" aria-live="polite">LTP unavailable/);
    assert.match(response.body, /selectedOrderContract\?\.tradingSymbol === tick\.tradingSymbol/);
    assert.match(response.body, /api\/options\/nifty\/order/);
    assert.match(response.body, /window\.confirm\(confirmation\)/);
    assert.match(response.body, /id="order-type"/);
    assert.match(response.body, /<option value="SL-M">Stop-market \(SL-M\)<\/option>/);
    assert.match(response.body, /<option value="BO">BO · Bracket order<\/option>/);
    assert.match(response.body, /orderType,/);
    assert.match(response.body, /squareOffType: orderSquareOffTypeSelect\.value/);
    assert.match(response.body, /trailingStopLoss: orderTrailingStopSelect\.value/);
    assert.match(response.body, /option-row:hover \.buy-button/);
    assert.match(response.body, /className = "option-price"/);
    assert.match(response.body, /<th scope="col">LTP<\/th>/);
    assert.match(response.body, /className = "open-order-ltp"/);
    assert.match(response.body, /new URLSearchParams\(\{ expiry \}\)/);
    assert.match(response.body, /params\.set\("symbols", orderSymbols\.join\(","\)\)/);
    assert.match(response.body, /addEventListener\("option-price"/);
    assert.match(response.body, /addEventListener\("feed-connected"/);
    assert.match(response.body, /data-state="idle"/);
    assert.match(response.body, /href="\/orders">Orders<\/a>/);
    assert.match(response.body, /class="call-head" colspan="2">CALLS/);
    assert.match(response.body, /class="put-head" colspan="2">PUTS/);
    assert.match(response.body, /spotPill\.className = "spot-pill"/);
    assert.doesNotMatch(response.body, /<th>Token<\/th>|<th>Lot size<\/th>/);
    assert.match(response.body, /api\/market\/nifty\/stream/);
    assert.doesNotMatch(response.body, /Refresh quotes/);
  });

  it("serves the separate orders page with open and closed filters", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const cookie = await frontendAccessCookie(app);
    const response = await app.inject({ url: "/orders", headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["content-type"] ?? ""), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /<h1>Orders<\/h1>/);
    assert.match(response.body, /data-filter="open"/);
    assert.match(response.body, /data-filter="closed"/);
    assert.match(response.body, /fetch\("\/api\/orders"/);
  });

  it("serves the live order and position stream page", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const cookie = await frontendAccessCookie(app);
    const response = await app.inject({ url: "/order-stream", headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /<h1>Live activity<\/h1>/);
    assert.match(response.body, /Order updates/);
    assert.match(response.body, /Position updates/);
    assert.match(response.body, /fetch\("\/api\/positions"/);
    assert.match(response.body, /"qty", "flBuyQty", "flSellQty"/);
    assert.match(response.body, /<th>Trading symbol<\/th><th>Product<\/th>/);
    assert.match(response.body, /<th>P&amp;L \(Sell - Buy\)<\/th>/);
    assert.doesNotMatch(response.body, /<th>Account<\/th>|<th>Exchange<\/th>/);
    assert.match(response.body, /"trdSym", "prod", "qty".*"pnl"/);
    assert.match(response.body, /Number\(position\.buyAmt\)/);
    assert.match(response.body, /sellAmount - buyAmount/);
    assert.match(response.body, /positionUpdates = extractPositions\(positionsPayload\)/);
    assert.doesNotMatch(response.body, /new Map\(\).*position/);
    assert.match(response.body, /new EventSource\("\/api\/orders\/stream"\)/);
    assert.match(response.body, /seenOrderEvents/);
  });

  it("serves the liquidity swing analysis page", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const cookie = await frontendAccessCookie(app);
    const response = await app.inject({ url: "/auto-trade", headers: { cookie } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body, /<h1>Liquidity swings<\/h1>/);
    assert.match(response.body, /value="NIFTY26N0925100PE"/);
    assert.match(response.body, /<option value="1min" selected>1 minute<\/option>/);
    assert.match(response.body, /<option value="5" selected>5 candles<\/option>/);
    assert.match(response.body, /<option value="high" selected>Swing high<\/option>/);
    assert.match(response.body, /<option value="low">Swing low<\/option>/);
    assert.match(response.body, /swingSideInput\.addEventListener\("change", renderSwings\)/);
    assert.match(response.body, /name="fromdate"/);
    assert.match(response.body, /name="todate"/);
    assert.match(response.body, /Detected swings/);
    assert.match(response.body, /\/api\/auto-trade\/liquidity-swings/);
  });

  it("requires authentication for the live order stream", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
      },
    });
    apps.push(app);

    const response = await app.inject("/api/orders/stream");

    assert.equal(response.statusCode, 401);
    assert.match(response.json().error, /Authenticate with Kotak Neo/);
  });

  it("requires authentication and configured order-book path for the orders API", async () => {
    let orderBookCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getOrderBook() {
          orderBookCalls += 1;
          return { stat: "Ok", data: [] };
        },
      },
    });
    apps.push(app);

    const unauthenticated = await app.inject("/api/orders");
    assert.equal(unauthenticated.statusCode, 401);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const notConfigured = await app.inject("/api/orders");
    assert.equal(notConfigured.statusCode, 503);
    assert.match(notConfigured.json().error, /KOTAK_NEO_ORDER_BOOK_PATH/);
    assert.equal(orderBookCalls, 0);
  });

  it("returns current positions for an authenticated configured session", async () => {
    const positions = { stat: "Ok", data: [{ trdSym: "ITC-EQ", qty: "15" }] };
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: { ...config.kotakNeo, positionsPath: "quick/user/positions" },
      },
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getPositions(session) {
          assert.deepEqual(session, authenticatedSession);
          return positions;
        },
      },
    });
    apps.push(app);

    const unauthenticated = await app.inject("/api/positions");
    assert.equal(unauthenticated.statusCode, 401);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject("/api/positions");

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), positions);
  });

  it("returns Kotak order book data for an authenticated configured session", async () => {
    const orderBook = { stat: "Ok", data: [{ nOrdNo: "123", ordSt: "open" }] };
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: { ...config.kotakNeo, orderBookPath: "quick/user/orders" },
      },
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getOrderBook(session) {
          assert.deepEqual(session, authenticatedSession);
          return orderBook;
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject("/api/orders");

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), orderBook);
  });

  it("cancels a current open AMO using order-book details", async () => {
    let cancelInput: unknown;
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: {
          ...config.kotakNeo,
          orderBookPath: "quick/user/orders",
          cancelOrderPath: "quick/order/cancel",
        },
      },
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getOrderBook() {
          return {
            stat: "Ok",
            data: [{ nOrdNo: "123", ordSt: "open", ordGenTp: "AMO", trdSym: "NIFTY30JAN2030CE" }],
          };
        },
        async cancelOrder(session, input) {
          assert.deepEqual(session, authenticatedSession);
          cancelInput = input;
          return { stat: "Ok", nOrdNo: "123" };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({ method: "POST", url: "/api/orders/123/cancel" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(cancelInput, {
      orderNumber: "123",
      amo: "YES",
      tradingSymbol: "NIFTY30JAN2030CE",
    });
    assert.deepEqual(response.json(), { stat: "Ok", nOrdNo: "123" });
  });

  it("passes order modification details to Kotak without local order or contract checks", async () => {
    let modifyInput: unknown;
    let orderBookCalls = 0;
    let scripMasterFileCalls = 0;
    let modifyCalls = 0;
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: {
          ...config.kotakNeo,
          orderBookPath: "",
          modifyOrderPath: "quick/order/vr/modify",
        },
      },
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() {
          throw new Error("Scrip Master API must not be called");
        },
        async getOrderBook(session) {
          orderBookCalls += 1;
          assert.deepEqual(session, authenticatedSession);
          throw new Error("Order-book preflight must not be called");
        },
        async modifyOrder(session, input) {
          assert.deepEqual(session, authenticatedSession);
          modifyCalls += 1;
          modifyInput = input;
          return { stat: "Ok", nOrdNo: "123" };
        },
      },
      optionChainCsvLoader: async () => {
        scripMasterFileCalls += 1;
        throw new Error("Scrip Master file must not be loaded");
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({
      method: "POST",
      url: "/api/orders/123/modify",
      payload: {
        instrumentToken: "unmapped-token",
        tradingSymbol: "UNKNOWN-EQ",
        transactionType: "BUY",
        quantity: "not-validated",
        filledQuantity: "not-validated",
        product: "CUSTOM-PRODUCT",
        orderType: "CUSTOM-TYPE",
        price: "not-validated",
        triggerPrice: "not-validated",
        validity: "CUSTOM-VALIDITY",
        amo: "NO",
        disclosedQuantity: "not-validated",
        marketProtection: "not-validated",
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(modifyInput, {
      orderNumber: "123",
      instrumentToken: "unmapped-token",
      tradingSymbol: "UNKNOWN-EQ",
      transactionType: "BUY",
      quantity: "not-validated",
      filledQuantity: "not-validated",
      product: "CUSTOM-PRODUCT",
      orderType: "CUSTOM-TYPE",
      price: "not-validated",
      validity: "CUSTOM-VALIDITY",
      amo: "NO",
      disclosedQuantity: "not-validated",
      marketProtection: "not-validated",
      triggerPrice: "not-validated",
    });
    assert.deepEqual(response.json(), { stat: "Ok", nOrdNo: "123" });
    assert.equal(orderBookCalls, 0);
    assert.equal(scripMasterFileCalls, 0);
    assert.equal(modifyCalls, 1);
  });

  it("refuses to cancel an order that is not open", async () => {
    let cancelCalls = 0;
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: {
          ...config.kotakNeo,
          orderBookPath: "quick/user/orders",
          cancelOrderPath: "quick/order/cancel",
        },
      },
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getOrderBook() {
          return { stat: "Ok", data: [{ nOrdNo: "123", ordSt: "complete" }] };
        },
        async cancelOrder() {
          cancelCalls += 1;
          return { stat: "Ok" };
        },
      },
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject({ method: "POST", url: "/api/orders/123/cancel" });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /Only open orders can be cancelled/);
    assert.equal(cancelCalls, 0);
  });

  it("serves Swagger UI and an OpenAPI document for the API routes", async () => {
    const app = buildApp({ config });
    apps.push(app);

    const cookie = await frontendAccessCookie(app, "/docs/");
    const uiResponse = await app.inject("/docs/");
    const authorizedUiResponse = await app.inject({ url: "/docs/", headers: { cookie } });
    assert.equal(uiResponse.statusCode, 303);
    assert.equal(authorizedUiResponse.statusCode, 200);
    assert.match(String(authorizedUiResponse.headers["content-type"] ?? ""), /text\/html/);

    const specResponse = await app.inject({ url: "/docs/json", headers: { cookie } });
    assert.equal(specResponse.statusCode, 200);
    const spec = specResponse.json();
    assert.equal(spec.openapi, "3.0.3");
    assert.deepEqual(Object.keys(spec.paths).sort(), [
      "/api/access/unlock",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/session",
      "/api/auto-trade/liquidity-swings",
      "/api/margin",
      "/api/market/nifty/stream",
      "/api/options/nifty/chain",
      "/api/options/nifty/expiries",
      "/api/options/nifty/order",
      "/api/orders",
      "/api/orders/stream",
      "/api/orders/{orderNumber}/cancel",
      "/api/orders/{orderNumber}/modify",
      "/api/positions",
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
    assert.deepEqual(
      spec.paths["/api/options/nifty/order"].post.requestBody.content["application/json"].schema.required,
      ["expiry", "tradingSymbol", "transactionType", "quantity", "product", "orderType", "price", "validity"],
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
      orderReady: true,
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
      orderReady: false,
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

  it("streams selected NIFTY option prices from the authenticated market feed", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const openOrderExpiryEpoch = String(Date.UTC(2030, 1, 6) / 1000 - 315_511_200);
    const strikes = [
      24750, 24800, 24850, 24900, 24950, 25050, 25100, 25150, 25200, 25250,
    ];
    const rows = strikes.flatMap((strike, index) => [
      `${100 + index * 2},OPTIDX,NIFTY,NIFTY30JAN2030CE${index || ""},CE,${expiryEpoch},${strike * 100},25`,
      `${101 + index * 2},OPTIDX,NIFTY,NIFTY30JAN2030PE${index || ""},PE,${expiryEpoch},${strike * 100},25`,
    ]);
    rows.push(`999,OPTIDX,NIFTY,NIFTY06FEB2030CE,CE,${openOrderExpiryEpoch},5000000,25`);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      ...rows,
    ].join("\n");
    let streamStopped = false;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        streamNiftyMarketData(
          _session,
          instruments,
          selectOptions,
          onIndexPrice,
          onOptionPrice,
          onError,
          onConnected,
        ) {
          assert.equal(instruments.length, 21);
          const selectedOptions = selectOptions(25000);
          assert.equal(selectedOptions.length, 21);
          assert.ok(selectedOptions.some(({ tradingSymbol }) => tradingSymbol === "NIFTY06FEB2030CE"));
          onIndexPrice({ price: 25000, asOf: "2030-01-30T10:00:00.000Z" });
          onOptionPrice({
            tradingSymbol: "NIFTY30JAN2030CE",
            price: 123.45,
            asOf: "2030-01-30T10:00:01.000Z",
          });
          onConnected?.();
          onError(new Error("Kotak market-data WebSocket disconnected"));
          return () => { streamStopped = true; };
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject(
      "/api/market/nifty/stream?expiry=30JAN2030&symbols=NIFTY06FEB2030CE",
    );

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /event: price\ndata: \{"price":25000,"asOf":"2030-01-30T10:00:00\.000Z"\}/);
    assert.match(response.body, /event: feed-connected\ndata: \{"status":"live"\}/);
    assert.match(
      response.body,
      /event: option-price\ndata: \{"tradingSymbol":"NIFTY30JAN2030CE","price":123\.45,"asOf":"2030-01-30T10:00:01\.000Z"\}/,
    );
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

  it("uses the Scrip Master token and Kotak candles to return liquidity swings", async () => {
    const expiryEpoch = String(Date.UTC(2026, 10, 9) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `12345,OPTIDX,NIFTY,NIFTY26N0925100PE,PE,${expiryEpoch},2510000,65`,
    ].join("\n");
    const candles = Array.from({ length: 40 }, (_, index) => {
      const timestamp = new Date(Date.UTC(2026, 10, 9, 3, 45 + index)).toISOString();
      return {
        timestamp,
        open: 5,
        high: index === 17 ? 20 : 10,
        low: 1,
        close: 5,
        volume: 100 + index,
      };
    });
    let candleRequest: unknown;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getHistoricalCandles(_session, input) {
          candleRequest = input;
          return candles;
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    const unauthorized = await app.inject(
      "/api/auto-trade/liquidity-swings?instrument=NIFTY26N0925100PE&interval=1min&pivotLookback=14&fromdate=2026-11-09&todate=2026-11-09",
    );
    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    const response = await app.inject(
      "/api/auto-trade/liquidity-swings?instrument=NIFTY26N0925100PE&interval=1min&fromdate=2026-11-09&todate=2026-11-09",
    );

    assert.equal(unauthorized.statusCode, 401);
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(candleRequest, {
      instrumentToken: "12345",
      exchangeSegment: "nse_fo",
      fromDate: "2026-11-09",
      toDate: "2026-11-09",
      interval: "1min",
    });
    assert.equal(response.json().instrument, "NIFTY26N0925100PE");
    assert.equal(response.json().candleCount, 40);
    assert.equal(response.json().swings.length, 1);
    assert.equal(response.json().swings[0].side, "high");
    assert.equal(response.json().swings[0].pivotTime, candles[17]!.timestamp);
    assert.equal(response.json().swings[0].qualifiedAt, candles[23]!.timestamp);

    const customLookbackResponse = await app.inject(
      "/api/auto-trade/liquidity-swings?instrument=NIFTY26N0925100PE&interval=1min&pivotLookback=14&fromdate=2026-11-09&todate=2026-11-09",
    );
    assert.equal(customLookbackResponse.statusCode, 200);
    assert.equal(customLookbackResponse.json().swings[0].qualifiedAt, candles[32]!.timestamp);
  });

  it("rejects historical candle ranges beyond Kotak interval limits", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        async getHistoricalCandles() { return []; },
      },
    });
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });

    const response = await app.inject(
      "/api/auto-trade/liquidity-swings?instrument=NIFTY26N0925100PE&interval=1min&fromdate=2026-10-01&todate=2026-11-09",
    );

    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /maximum date range of 30 days/);
  });

  it("requires authentication before placing a NIFTY option order", async () => {
    let orderCalls = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
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
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
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
        async login() { return { ...authenticatedSession, serverId: "test-server-id" }; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
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
        async login() { return { ...authenticatedSession, serverId: "server-id" }; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
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

  it("places one automatic SELL stop-limit after an app BUY order is fully filled", async () => {
    const expiryEpoch = String(Date.UTC(2030, 0, 30) / 1000 - 315_511_200);
    const csv = [
      "pSymbol,pInstType,pSymbolName,pTrdSymbol,pOptionType,pExpiryDate,dStrikePrice;,lLotSize",
      `123,OPTIDX,NIFTY,NIFTY30JAN2030CE,CE,${expiryEpoch},2500000,25`,
    ].join("\n");
    const orderInputs: PlaceNiftyOptionOrderInput[] = [];
    let receiveOrderUpdate:
      | ((update: { type: "order" | "position"; data: Record<string, unknown> }) => void)
      | undefined;
    let resolveSell: (() => void) | undefined;
    const sellPlaced = new Promise<void>((resolve) => {
      resolveSell = resolve;
    });
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: {
          ...config.kotakNeo,
          placeOrderPath: "quick/order/place",
          orderSource: "NEOTRADEAPI",
        },
      },
      authClient: {
        async login() {
          return { ...authenticatedSession, baseUrl: "https://kotak.example/" };
        },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
        streamOrderPositionUpdates(_session, onUpdate, onState) {
          receiveOrderUpdate = onUpdate;
          onState("connected");
          return () => {};
        },
        async placeNiftyOptionOrder(_session, input) {
          orderInputs.push(input);
          if (input.transactionType === "S") resolveSell?.();
          return {
            stat: "Ok",
            nOrdNo: input.transactionType === "B" ? "buy-42" : "sell-42",
          };
        },
      },
      optionChainCsvLoader: async () => csv,
    });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/auth/login", payload: { totp: "123456" } });
    assert.ok(receiveOrderUpdate);
    const buyResponse = await app.inject({
      method: "POST",
      url: "/api/options/nifty/order",
      payload: {
        expiry: "30JAN2030",
        tradingSymbol: "NIFTY30JAN2030CE",
        transactionType: "B",
        quantity: "50",
        product: "MIS",
        orderType: "L",
        price: "102.50",
        validity: "DAY",
      },
    });
    assert.equal(buyResponse.statusCode, 200);

    receiveOrderUpdate({
      type: "order",
      data: { nOrdNo: "buy-42", trnsTp: "B", ordSt: "open", qty: "50", fldQty: "25", avgPrc: "102.50" },
    });
    assert.equal(orderInputs.length, 1, "partial fills must not submit an automatic SELL");

    receiveOrderUpdate({
      type: "order",
      data: {
        nOrdNo: "buy-42",
        trnsTp: "B",
        ordSt: "complete",
        qty: "50",
        fldQty: "50",
        avgPrc: "102.50",
      },
    });
    await sellPlaced;
    receiveOrderUpdate({
      type: "order",
      data: {
        nOrdNo: "buy-42",
        trnsTp: "B",
        ordSt: "complete",
        qty: "50",
        fldQty: "50",
        avgPrc: "102.50",
      },
    });

    assert.equal(orderInputs.length, 2, "duplicate fill events must not submit duplicate SELL orders");
    assert.deepEqual(orderInputs[1], {
      tradingSymbol: "NIFTY30JAN2030CE",
      instrumentToken: "123",
      transactionType: "S",
      quantity: "50",
      product: "MIS",
      orderType: "SL",
      price: "97.50",
      validity: "DAY",
      amo: "NO",
      disclosedQuantity: "0",
      marketProtection: "0",
      triggerPrice: "97.50",
      tag: orderInputs[1]?.tag,
    });
    assert.match(String(orderInputs[1]?.tag), /^AT5-[0-9a-f]{16}$/);
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
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
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
        async login() { return authenticatedSession; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
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
        async login() { return { ...authenticatedSession, serverId: "test-server-id" }; },
        async getScripMaster() { return { data: { filesPaths: [] } }; },
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
