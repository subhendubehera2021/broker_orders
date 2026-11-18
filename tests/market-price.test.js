import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKotakMarketDataAuthPayload,
  createKotakMarketDataWebSocketUrl,
  decodeMarketDataBatch,
  KotakMarketPriceStream,
  parseMarketInstrument,
} from "../src/market-price/market-price-stream.js";

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    super();
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.closeArgs = null;
    FakeWebSocket.instances.push(this);
  }

  send(value) {
    this.sent.push(value);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(data) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  close(code = 1000, reason = "") {
    this.closeArgs = [code, reason];
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason }));
  }
}
FakeWebSocket.instances = [];

function createStream() {
  const alarms = [];
  const backgroundTasks = [];
  const stored = new Map();
  const ctx = {
    storage: {
      async setAlarm(timestamp) {
        alarms.push(timestamp);
      },
      async deleteAlarm() {},
      async get(key) {
        return stored.get(key);
      },
      async put(key, value) {
        stored.set(key, value);
      },
    },
    waitUntil(promise) {
      backgroundTasks.push(promise);
    },
  };
  const env = {
    KOTAK_MARKET_DATA_UCC: "client-code",
    KOTAK_WS_SID: "market-session-sid",
    KOTAK_WS_SESSION_TOKEN: "market-session-token",
  };
  return {
    stream: new KotakMarketPriceStream(ctx, env, FakeWebSocket),
    alarms,
    backgroundTasks,
  };
}

function createMiniTouchLine(token = 1333, exchangeId = 1) {
  const bytes = new Uint8Array(54);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 54, true);
  view.setUint16(2, 7208, true);
  view.setInt8(4, exchangeId);
  view.setUint8(5, 1);
  view.setUint32(9, token, true);
  view.setBigInt64(13, 0n, true);
  view.setUint32(21, 123456, true);
  view.setUint32(33, 120000, true);
  view.setInt32(37, 125, true);
  view.setInt32(41, 1456, true);
  view.setUint8(49, 2);
  return bytes;
}

function createIndexPacket() {
  const bytes = new Uint8Array(87);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 87, true);
  view.setUint16(2, 7207, true);
  view.setInt8(4, 1);
  view.setInt32(17, 120000, true);
  view.setInt32(29, 121234, true);
  view.setInt32(49, 103, true);
  view.setUint8(61, 2);
  return bytes;
}

test("validates Kotak instruments and builds market-feed connection credentials", () => {
  assert.deepEqual(parseMarketInstrument("nse_cm|1333"), {
    inputToken: "nse_cm|1333",
    exchange: "nse_cm",
    exchangeId: 1,
    instrument: "1333",
    isIndex: false,
    token: 1333,
  });
  assert.equal(parseMarketInstrument("nse_cm|Nifty 50").isIndex, true);
  assert.throws(() => parseMarketInstrument("unknown|1333"), /supported Kotak exchange/);
  assert.throws(() => parseMarketInstrument("nse_cm|1,1333"), /exchange\|instrument/);
  assert.equal(
    createKotakMarketDataWebSocketUrl("https://feed.example.test/apifeed?tenant=1"),
    "wss://feed.example.test/apifeed?tenant=1",
  );
  assert.equal(
    createKotakMarketDataWebSocketUrl("wss://sfeed.kotaksecurities.com/apifeed"),
    "wss://sfeed.kotaksecurities.com/apifeed",
  );
  assert.throws(
    () => createKotakMarketDataWebSocketUrl("http://feed.example.test"),
    /HTTPS or WSS URL/,
  );
  assert.deepEqual(
    JSON.parse(createKotakMarketDataAuthPayload("client-code", "session-sid", "2026-11-17")),
    {
      user: "client-code",
      auth: "session-sid",
      format: "native_batch",
      source: "NEOTRADEAPI",
      sdk_version: 1.1,
      sdk_date: "2026-11-17",
    },
  );
  assert.throws(() => createKotakMarketDataAuthPayload("", "session-token"), /KOTAK_MARKET_DATA_UCC/);
  assert.throws(() => createKotakMarketDataAuthPayload("client-code", ""), /KOTAK_WS_SID/);
});

test("decodes matching mini touch-line and index packets with exchange dividers", () => {
  const stock = parseMarketInstrument("nse_cm|1333");
  const stockPrices = decodeMarketDataBatch(
    new Uint8Array([...createMiniTouchLine(), ...createMiniTouchLine(9999)]),
    stock,
    { 1: 100 },
    "2026-11-17T07:45:00.000Z",
  );
  assert.deepEqual(stockPrices, [{
    inputToken: "nse_cm|1333",
    exchange: "nse_cm",
    instrument: "1333",
    ltp: 1234.56,
    change: 14.56,
    changePercent: 1.25,
    precision: 2,
    receivedAt: "2026-11-17T07:45:00.000Z",
  }]);

  const indexPrices = decodeMarketDataBatch(
    createIndexPacket(),
    parseMarketInstrument("nse_cm|Nifty 50"),
    { 1: 100 },
  );
  assert.equal(indexPrices[0].ltp, 1212.34);
  assert.equal(indexPrices[0].change, 12.34);
  assert.equal(indexPrices[0].changePercent, 1.03);
});

test("authenticates, subscribes, and streams a live price over SSE", async () => {
  FakeWebSocket.instances = [];
  const { stream, alarms, backgroundTasks } = createStream();
  const response = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_cm%7C1333",
  ));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(FakeWebSocket.instances[0].url, "wss://sfeed.kotaksecurities.com/apifeed");
  assert.equal(FakeWebSocket.instances[0].binaryType, "arraybuffer");
  assert.equal(alarms.length, 1);
  await Promise.all(backgroundTasks);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const initialStatus = decoder.decode((await reader.read()).value);
  assert.match(initialStatus, /"state":"connecting"/);

  const socket = FakeWebSocket.instances[0];
  socket.open();
  const auth = JSON.parse(socket.sent[0]);
  assert.equal(auth.user, "client-code");
  assert.equal(auth.auth, "market-session-sid");

  socket.receive(JSON.stringify({
    message_code: 1117,
    exchanges: { nse_cm: { divider: 100 } },
  }));
  assert.deepEqual(socket.sent.slice(1).map((message) => {
    const parsed = JSON.parse(message);
    return [parsed.event, parsed.inputtoken];
  }), [
    ["subscribeIndices", "nse_cm|Nifty 50"],
    ["snapshotIndices", "nse_cm|Nifty 50"],
    ["subscribeScripsLite", "nse_cm|1333"],
    ["snapshotScripsLite", "nse_cm|1333"],
  ]);
  socket.receive(JSON.stringify({
    message_code: 1109,
    error_code: 0,
    data: { "nse_cm|1333": { trading_symbols: "HDFCBANK-EQ" } },
  }));
  const loggedMessages = [];
  const originalLog = console.log;
  console.log = (message) => loggedMessages.push(message);
  try {
    socket.receive(createIndexPacket());
    socket.receive(createMiniTouchLine());
  } finally {
    console.log = originalLog;
  }

  let priceEvent = "";
  while (!priceEvent) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    const event = decoder.decode(value);
    if (event.startsWith("event: price")) priceEvent = event;
  }
  const price = JSON.parse(priceEvent.match(/data: (.*)\n\n/)[1]);
  assert.equal(price.symbol, "HDFCBANK-EQ");
  assert.equal(price.ltp, 1234.56);
  assert.equal(price.change, 14.56);
  assert.equal(stream.getStatus().state, "live");
  assert.ok(!loggedMessages.some((message) => message.startsWith("[market-price] tick ")));

  await reader.cancel();
  await Promise.all(backgroundTasks);
  assert.equal(stream.sseClients.size, 0);
  assert.deepEqual(socket.closeArgs, [1000, "No live market-price clients"]);
});

test("keeps background Nifty subscribed while adding and removing requested instruments", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  const started = await stream.fetch(new Request(
    "https://market-price.internal/ensure-default",
    { method: "POST" },
  ));
  assert.equal(started.status, 200);
  assert.equal((await started.json()).inputToken, "nse_cm|Nifty 50");
  await Promise.all(backgroundTasks);

  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive(JSON.stringify({ message_code: 1117 }));
  socket.receive(JSON.stringify({
    message_code: 1109,
    error_code: 0,
    data: { "nse_cm|Nifty 50": { trading_symbols: "NIFTY 50" } },
  }));
  const response = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_fo%7C45402",
  ));
  const reader = response.body.getReader();

  const subscriptions = socket.sent.slice(1).map((message) => {
    const parsed = JSON.parse(message);
    return [parsed.event, parsed.inputtoken];
  });
  assert.deepEqual(subscriptions, [
    ["subscribeIndices", "nse_cm|Nifty 50"],
    ["snapshotIndices", "nse_cm|Nifty 50"],
    ["subscribeScripsLite", "nse_fo|45402"],
    ["snapshotScripsLite", "nse_fo|45402"],
  ]);

  await reader.cancel();
  await Promise.all(backgroundTasks);
  assert.equal(socket.closeArgs, null);
  assert.equal(stream.currentInstrument.inputToken, "nse_cm|Nifty 50");
  assert.ok(socket.sent.some((message) => {
    const parsed = JSON.parse(message);
    return parsed.event === "unsubscribeScripsLite" && parsed.inputtoken === "nse_fo|45402";
  }));
  assert.ok(!socket.sent.some((message) => {
    const parsed = JSON.parse(message);
    return parsed.event === "unsubscribeIndices" && parsed.inputtoken === "nse_cm|Nifty 50";
  }));
});

test("maintains multiple explicit instruments and unsubscribes only the selected instrument", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  const addOne = await stream.fetch(new Request(
    "https://market-price.internal/subscribe?instrument=nse_cm%7C1333",
    { method: "POST" },
  ));
  const addTwo = await stream.fetch(new Request(
    "https://market-price.internal/subscribe?instrument=nse_fo%7C45402",
    { method: "POST" },
  ));
  assert.equal(addOne.status, 200);
  assert.equal(addTwo.status, 200);
  assert.deepEqual((await addTwo.json()).instruments.map(({ inputToken }) => inputToken), [
    "nse_cm|Nifty 50",
    "nse_cm|1333",
    "nse_fo|45402",
  ]);
  await Promise.all(backgroundTasks);

  const response = await stream.fetch(new Request("https://market-price.internal/events"));
  const reader = response.body.getReader();
  await Promise.all(backgroundTasks);
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive(JSON.stringify({ message_code: 1117 }));
  const subscriptions = socket.sent.slice(1).map((message) => {
    const parsed = JSON.parse(message);
    return [parsed.event, parsed.inputtoken];
  });
  assert.deepEqual(subscriptions, [
    ["subscribeIndices", "nse_cm|Nifty 50"],
    ["snapshotIndices", "nse_cm|Nifty 50"],
    ["subscribeScripsLite", "nse_cm|1333"],
    ["snapshotScripsLite", "nse_cm|1333"],
    ["subscribeScripsLite", "nse_fo|45402"],
    ["snapshotScripsLite", "nse_fo|45402"],
  ]);
  socket.receive(JSON.stringify({
    message_code: 1109,
    error_code: 0,
    data: {
      "nse_cm|Nifty 50": { trading_symbols: "NIFTY 50" },
      "nse_cm|1333": { trading_symbols: "HDFCBANK-EQ" },
      "nse_fo|45402": { trading_symbols: "NIFTY-FUT" },
    },
  }));
  socket.receive(createMiniTouchLine(1333, 1));
  socket.receive(createMiniTouchLine(45402, 2));

  const decoder = new TextDecoder();
  const prices = new Set();
  while (prices.size < 2) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    const event = decoder.decode(value);
    if (!event.startsWith("event: price")) continue;
    prices.add(JSON.parse(event.match(/data: (.*)\n\n/)[1]).inputToken);
  }
  assert.deepEqual([...prices].sort(), ["nse_cm|1333", "nse_fo|45402"]);

  const removed = await stream.fetch(new Request(
    "https://market-price.internal/unsubscribe?instrument=nse_cm%7C1333",
    { method: "POST" },
  ));
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).instruments.map(({ inputToken }) => inputToken), [
    "nse_cm|Nifty 50",
    "nse_fo|45402",
  ]);
  assert.ok(socket.sent.some((message) => {
    const parsed = JSON.parse(message);
    return parsed.event === "unsubscribeScripsLite" && parsed.inputtoken === "nse_cm|1333";
  }));
  const defaultUnsubscribe = await stream.fetch(new Request(
    "https://market-price.internal/unsubscribe?instrument=nse_cm%7CNifty%2050",
    { method: "POST" },
  ));
  assert.equal(defaultUnsubscribe.status, 400);

  await reader.cancel();
  await Promise.all(backgroundTasks);
  assert.equal(socket.closeArgs, null);
});

test("reconnects the background Nifty stream without SSE clients", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  await stream.fetch(new Request(
    "https://market-price.internal/ensure-default",
    { method: "POST" },
  ));
  await Promise.all(backgroundTasks);
  const firstSocket = FakeWebSocket.instances[0];
  firstSocket.close(1006, "Temporary disconnect");

  assert.equal(stream.retryScheduled, true);
  assert.equal(stream.sseClients.size, 0);

  await stream.alarm();
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(stream.currentInstrument.inputToken, "nse_cm|Nifty 50");
});

test("manually restarts the market socket while preserving all desired instruments", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  await stream.fetch(new Request(
    "https://market-price.internal/subscribe?instrument=nse_fo%7C45318",
    { method: "POST" },
  ));
  await Promise.all(backgroundTasks);
  const firstSocket = FakeWebSocket.instances[0];
  firstSocket.open();
  firstSocket.receive(JSON.stringify({ message_code: 1117 }));

  const response = await stream.fetch(new Request(
    "https://market-price.internal/restart",
    { method: "POST" },
  ));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.state, "connecting");
  assert.deepEqual(result.instruments.map(({ inputToken }) => inputToken), [
    "nse_cm|Nifty 50",
    "nse_fo|45318",
  ]);
  assert.deepEqual(firstSocket.closeArgs, [
    1000,
    "Manual market-data connection refresh",
  ]);
  assert.equal(FakeWebSocket.instances.length, 2);

  const secondSocket = FakeWebSocket.instances[1];
  secondSocket.open();
  secondSocket.receive(JSON.stringify({ message_code: 1117 }));
  assert.deepEqual(secondSocket.sent.slice(1).map((message) => {
    const parsed = JSON.parse(message);
    return [parsed.event, parsed.inputtoken];
  }), [
    ["subscribeIndices", "nse_cm|Nifty 50"],
    ["snapshotIndices", "nse_cm|Nifty 50"],
    ["subscribeScripsLite", "nse_fo|45318"],
    ["snapshotScripsLite", "nse_fo|45318"],
  ]);
  await Promise.all(backgroundTasks);
});

test("disconnects the market feed and clears active state and alarms", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  let deletedAlarm = false;
  stream.ctx.storage.deleteAlarm = async () => {
    deletedAlarm = true;
  };

  await stream.fetch(new Request(
    "https://market-price.internal/subscribe?instrument=nse_fo%7C45318",
    { method: "POST" },
  ));
  await Promise.all(backgroundTasks);
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive(JSON.stringify({ message_code: 1117 }));

  const response = await stream.fetch(new Request(
    "https://market-price.internal/disconnect",
    { method: "POST" },
  ));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.state, "disconnected");
  assert.equal(result.manuallyDisconnected, true);
  assert.equal(deletedAlarm, true);
  assert.equal(await stream.ctx.storage.get("backgroundMode"), false);
  assert.equal(await stream.ctx.storage.get("manuallyDisconnected"), true);
  assert.equal(stream.socket, null);
  assert.deepEqual(socket.closeArgs, [1000, "Manually disconnected"]);
  assert.equal(stream.connectionState, "disconnected");

  // Cron / page-load ensure-default, order-driven subscribe and dashboard SSE must not reconnect.
  await stream.fetch(new Request("https://market-price.internal/ensure-default", { method: "POST" }));
  await stream.fetch(new Request(
    "https://market-price.internal/subscribe?instrument=nse_fo%7C99999",
    { method: "POST" },
  ));
  const events = await stream.fetch(new Request("https://market-price.internal/events"));
  await Promise.all(backgroundTasks);
  await stream.alarm();
  assert.equal(FakeWebSocket.instances.length, 1);
  await events.body.cancel();

  // A fresh Durable Object instance (after eviction) still remembers the manual disconnect.
  const revived = new KotakMarketPriceStream(stream.ctx, stream.env, FakeWebSocket);
  await revived.fetch(new Request("https://market-price.internal/ensure-default", { method: "POST" }));
  assert.equal(FakeWebSocket.instances.length, 1);

  // Explicit restart resumes.
  const restarted = await revived.fetch(new Request(
    "https://market-price.internal/restart",
    { method: "POST" },
  ));
  assert.equal((await restarted.json()).manuallyDisconnected, false);
  assert.equal(FakeWebSocket.instances.length, 2);
});

test("uses a freshly configured feed URL when provided", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  stream.env.KOTAK_MARKET_DATA_FEED_URL = "https://fresh-feed.example.test/apifeed";
  const response = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_cm%7C1333",
  ));
  const reader = response.body.getReader();

  assert.equal(FakeWebSocket.instances[0].url, "wss://fresh-feed.example.test/apifeed");
  await reader.cancel();
  await Promise.all(backgroundTasks);
});

test("retries when market-feed authentication or subscription handshake times out", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  const response = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_cm%7C1333",
  ));
  const reader = response.body.getReader();
  await Promise.all(backgroundTasks);

  const firstSocket = FakeWebSocket.instances[0];
  await stream.alarm();
  assert.deepEqual(firstSocket.closeArgs, [1000, "Refreshing Kotak market-data connection"]);
  assert.equal(stream.getStatus().state, "reconnecting");
  assert.match(stream.getStatus().error, /timed out/);
  assert.equal(stream.retryScheduled, true);

  await Promise.all(backgroundTasks);
  await stream.alarm();
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(stream.getStatus().state, "connecting");

  await reader.cancel();
  await Promise.all(backgroundTasks);
});

test("reconnects after Kotak rejects a market instrument subscription", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  const response = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_cm%7C1333",
  ));
  const reader = response.body.getReader();
  await Promise.all(backgroundTasks);

  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive(JSON.stringify({ message_code: 1117 }));
  socket.receive(JSON.stringify({
    message_code: 1109,
    error_code: 1,
    description: "Temporary subscription failure",
  }));
  await Promise.all(backgroundTasks);

  assert.deepEqual(socket.closeArgs, [1011, "Kotak rejected instrument subscription: Temporary subscription failure"]);
  assert.equal(stream.retryScheduled, true);
  assert.match(stream.getStatus().error, /Temporary subscription failure/);

  await stream.alarm();
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(stream.getStatus().state, "connecting");

  await reader.cancel();
  await Promise.all(backgroundTasks);
});

test("connects immediately when the instrument changes during a scheduled retry", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  const firstResponse = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_cm%7CNifty%2050",
  ));
  await Promise.all(backgroundTasks);
  const firstSocket = FakeWebSocket.instances[0];
  firstSocket.close(1006, "Temporary disconnect");
  assert.equal(stream.retryScheduled, true);

  const nextResponse = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_fo%7C45402",
  ));
  await Promise.all(backgroundTasks);

  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(stream.currentInstrument.inputToken, "nse_fo|45402");
  assert.equal(stream.retryScheduled, false);
  assert.equal(stream.getStatus().state, "connecting");

  await firstResponse.body.cancel();
  await nextResponse.body.cancel();
  await Promise.all(backgroundTasks);
});

test("rejects malformed instruments and reports missing market-feed credentials", async () => {
  FakeWebSocket.instances = [];
  const { stream, backgroundTasks } = createStream();
  const invalid = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=unknown%7C1333",
  ));
  assert.equal(invalid.status, 400);
  assert.equal(FakeWebSocket.instances.length, 0);

  stream.env.KOTAK_MARKET_DATA_UCC = "";
  const response = await stream.fetch(new Request(
    "https://market-price.internal/events?instrument=nse_cm%7C1333",
  ));
  await Promise.all(backgroundTasks);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const initial = decoder.decode((await reader.read()).value);
  assert.match(initial, /"state":"disconnected"/);
  let events = "";
  while (!events.includes('"state":"error"')) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    events += decoder.decode(value);
  }
  assert.match(events, /"state":"error".*KOTAK_MARKET_DATA_UCC/);
  assert.equal(FakeWebSocket.instances.length, 0);
  await reader.cancel();
});
