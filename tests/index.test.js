import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

test("scheduled handler waits until the target time and calls the API once", async () => {
  const messages = [];
  const requests = [];
  const originalLog = console.log;
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  const originalFetch = globalThis.fetch;
  let now = Date.UTC(2026, 10, 16, 6, 58, 1);
  let delay;
  console.log = (message) => messages.push(message);
  Date.now = () => now;
  globalThis.setTimeout = (callback, waitMs) => {
    delay = waitMs;
    now += waitMs;
    callback();
    return 0;
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(null, { status: 200 });
  };

  try {
    await worker.scheduled(
      {
        cron: "* * * * *",
        scheduledTime: Date.UTC(2026, 10, 16, 6, 58, 0),
      },
      { LIQUIDITY_SWING_API_TOKEN: "test-api-token" },
    );
  } finally {
    console.log = originalLog;
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.fetch = originalFetch;
  }

  assert.equal(delay, 58_000);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://broker-orders.vercel.app/api/liquidity-swing");
  assert.equal(requests[0].options.method, "GET");
  assert.deepEqual(requests[0].options.headers, {
    Accept: "*/*",
    Authorization: "Bearer test-api-token",
  });
  assert.equal(requests[0].options.redirect, "manual");
  assert.deepEqual(messages, [
    "[nifty-cron] cron=* * * * * scheduledForIST=16/11/2026, 12:28:59 IST startedAtIST=16/11/2026, 12:28:59 IST",
    "[nifty-cron] liquidity-swing-api status=200",
  ]);
});

test("separate scheduled trigger starts the order and default market-price streams", async () => {
  const calls = [];
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => messages.push(message);
  const env = {
    ORDER_STREAM: {
      idFromName(name) {
        calls.push({ name });
        return "stable-order-stream-id";
      },
      get(id) {
        calls.push({ id });
        return {
          async fetch(url, options) {
            calls.push({ url, options });
            return Response.json({ state: "connecting" });
          },
        };
      },
    },
    MARKET_PRICE_STREAM: {
      idFromName(name) {
        calls.push({ name });
        return "stable-market-price-stream-id";
      },
      get(id) {
        calls.push({ id });
        return {
          async fetch(url, options) {
            calls.push({ url, options });
            return Response.json({ state: "connecting" });
          },
        };
      },
    },
  };

  try {
    await worker.scheduled({ cron: "*/1 * * * *" }, env);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    { name: "kotak-order-stream" },
    { id: "stable-order-stream-id" },
    {
      url: "https://order-stream.internal/start",
      options: { method: "POST" },
    },
    { name: "kotak-market-price-stream" },
    { id: "stable-market-price-stream-id" },
    {
      url: "https://market-price.internal/ensure-default",
      options: { method: "POST" },
    },
  ]);
  assert.deepEqual(messages.sort(), [
    "[market-price] supervisor state=connecting",
    "[order-websocket] supervisor state=connecting",
  ]);
});

test("authenticated start endpoint starts the single Durable Object stream", async () => {
  const calls = [];
  const stub = {
    async fetch(url, options) {
      calls.push({ url, options });
      return Response.json({ state: "connecting" });
    },
  };
  const env = {
    ORDER_STREAM_CONTROL_TOKEN: "control-secret",
    ORDER_STREAM: {
      idFromName(name) {
        calls.push({ name });
        return "stable-order-stream-id";
      },
      get(id) {
        calls.push({ id });
        return stub;
      },
    },
  };

  const response = await worker.fetch(
    new Request("https://worker.example/internal/order-stream/start", {
      method: "POST",
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: "connecting" });
  assert.deepEqual(calls, [
    { name: "kotak-order-stream" },
    { id: "stable-order-stream-id" },
    {
      url: "https://order-stream.internal/start",
      options: { method: "POST" },
    },
  ]);
});

test("start endpoint rejects unauthorized and non-POST requests", async () => {
  const env = {
    ORDER_STREAM_CONTROL_TOKEN: "control-secret",
    ORDER_STREAM: {
      idFromName() {
        assert.fail("Unauthorized requests must not access the Durable Object");
      },
    },
  };
  const unauthorized = await worker.fetch(
    new Request("https://worker.example/internal/order-stream/start", { method: "POST" }),
    env,
  );
  const wrongMethod = await worker.fetch(
    new Request("https://worker.example/internal/order-stream/start", {
      method: "GET",
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );

  assert.equal(unauthorized.status, 401);
  assert.equal(wrongMethod.status, 404);
});

test("serves the dashboard and protects the status endpoint", async () => {
  const calls = [];
  const env = {
    ORDER_STREAM_CONTROL_TOKEN: "control-secret",
    ORDER_STREAM: {
      idFromName: () => "stable-order-stream-id",
      get: () => ({
        async fetch(url, options) {
          calls.push({ url, options });
          return Response.json({
            state: "connected",
            authenticated: true,
            lastMessageAt: null,
            lastMessageType: null,
          });
        },
      }),
    },
    MARKET_PRICE_STREAM: {
      idFromName(name) {
        calls.push({ name });
        return "stable-market-price-stream-id";
      },
      get(id) {
        calls.push({ id });
        return {
          async fetch(url, options) {
            calls.push({ url, options });
            return Response.json({ state: "connecting" });
          },
        };
      },
    },
  };
  const dashboard = await worker.fetch(new Request("https://worker.example/"), env);
  const unauthorized = await worker.fetch(
    new Request("https://worker.example/internal/order-stream/status"),
    env,
  );
  const status = await worker.fetch(
    new Request("https://worker.example/internal/order-stream/status", {
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );

  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get("content-type"), /text\/html/);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /Order stream/);
  assert.match(dashboardHtml, /Live stock prices/);
  assert.match(dashboardHtml, /id="market-price-rows"/);
  assert.match(dashboardHtml, /Nifty 50 remains subscribed by default/);
  assert.equal(unauthorized.status, 401);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), {
    state: "connected",
    authenticated: true,
    lastMessageAt: null,
    lastMessageType: null,
  });
  assert.deepEqual(calls, [
    { name: "kotak-market-price-stream" },
    { id: "stable-market-price-stream-id" },
    {
      url: "https://market-price.internal/ensure-default",
      options: { method: "POST" },
    },
    { url: "https://order-stream.internal/status", options: { method: "GET" } },
  ]);
});

test("serves a standalone live-price page with its own control-token field", async () => {
  const response = await worker.fetch(new Request("https://worker.example/live-price"), {
    MARKET_PRICE_STREAM: {
      idFromName: () => "stable-market-price-stream-id",
      get: () => ({
        async fetch() {
          return Response.json({ state: "connecting" });
        },
      }),
    },
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.match(html, /<title>Kotak Live Market Price<\/title>/);
  assert.match(html, /id="token"/);
  assert.match(html, /id="market-price-rows"/);
  assert.doesNotMatch(html, /id="order-table-body"/);
});

test("protects and proxies the live SSE endpoint", async () => {
  const calls = [];
  const env = {
    ORDER_STREAM_CONTROL_TOKEN: "control-secret",
    ORDER_STREAM: {
      idFromName: () => "stable-order-stream-id",
      get: () => ({
        async fetch(url, options) {
          calls.push({ url, options });
          return new Response("event: status\ndata: {}\n\n", {
            headers: { "Content-Type": "text/event-stream; charset=utf-8" },
          });
        },
      }),
    },
  };
  const unauthorized = await worker.fetch(
    new Request("https://worker.example/internal/order-stream/events"),
    env,
  );
  const response = await worker.fetch(
    new Request("https://worker.example/internal/order-stream/events", {
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );

  assert.equal(unauthorized.status, 401);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.deepEqual(calls, [
    { url: "https://order-stream.internal/events", options: { method: "GET" } },
  ]);
});

test("protects and proxies the selected market-price instrument to its Durable Object", async () => {
  const calls = [];
  const env = {
    ORDER_STREAM_CONTROL_TOKEN: "control-secret",
    MARKET_PRICE_STREAM: {
      idFromName(name) {
        calls.push({ name });
        return "stable-market-price-id";
      },
      get(id) {
        calls.push({ id });
        return {
          async fetch(url, options) {
            calls.push({ url, options });
            return new Response("event: status\ndata: {}\n\n", {
              headers: { "Content-Type": "text/event-stream; charset=utf-8" },
            });
          },
        };
      },
    },
  };
  const unauthorized = await worker.fetch(
    new Request("https://worker.example/internal/market-price/events?instrument=nse_cm%7C1333"),
    env,
  );
  const response = await worker.fetch(
    new Request("https://worker.example/internal/market-price/events?instrument=nse_cm%7C1333", {
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );

  assert.equal(unauthorized.status, 401);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.deepEqual(calls, [
    { name: "kotak-market-price-stream" },
    { id: "stable-market-price-id" },
    {
      url: "https://market-price.internal/events?instrument=nse_cm%7C1333",
      options: { method: "GET" },
    },
  ]);
});

test("protects and proxies market watchlist APIs and the shared event stream", async () => {
  const calls = [];
  const env = {
    ORDER_STREAM_CONTROL_TOKEN: "control-secret",
    MARKET_PRICE_STREAM: {
      idFromName: (name) => {
        calls.push({ name });
        return "stable-market-price-id";
      },
      get: (id) => {
        calls.push({ id });
        return {
          async fetch(url, options) {
            calls.push({ url, options });
            return Response.json({ instruments: [] });
          },
        };
      },
    },
  };
  const unauthorized = await worker.fetch(
    new Request("https://worker.example/internal/market-price/instruments"),
    env,
  );
  assert.equal(unauthorized.status, 401);

  const listed = await worker.fetch(
    new Request("https://worker.example/internal/market-price/instruments", {
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );
  const subscribed = await worker.fetch(
    new Request("https://worker.example/internal/market-price/subscribe?instrument=nse_cm%7C1333", {
      method: "POST",
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );
  const unsubscribed = await worker.fetch(
    new Request("https://worker.example/internal/market-price/unsubscribe?instrument=nse_cm%7C1333", {
      method: "POST",
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );
  const events = await worker.fetch(
    new Request("https://worker.example/internal/market-price/events", {
      headers: { Authorization: "Bearer control-secret" },
    }),
    env,
  );

  assert.equal(listed.status, 200);
  assert.equal(subscribed.status, 200);
  assert.equal(unsubscribed.status, 200);
  assert.equal(events.status, 200);
  assert.deepEqual(calls, [
    { name: "kotak-market-price-stream" },
    { id: "stable-market-price-id" },
    { url: "https://market-price.internal/instruments", options: { method: "GET" } },
    { name: "kotak-market-price-stream" },
    { id: "stable-market-price-id" },
    {
      url: "https://market-price.internal/subscribe?instrument=nse_cm%7C1333",
      options: { method: "POST" },
    },
    { name: "kotak-market-price-stream" },
    { id: "stable-market-price-id" },
    {
      url: "https://market-price.internal/unsubscribe?instrument=nse_cm%7C1333",
      options: { method: "POST" },
    },
    { name: "kotak-market-price-stream" },
    { id: "stable-market-price-id" },
    { url: "https://market-price.internal/events", options: { method: "GET" } },
  ]);
});
