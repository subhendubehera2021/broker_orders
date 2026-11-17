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
  const ctx = {
    storage: {
      async setAlarm(timestamp) {
        alarms.push(timestamp);
      },
      async deleteAlarm() {},
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

function createMiniTouchLine(token = 1333) {
  const bytes = new Uint8Array(54);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 54, true);
  view.setUint16(2, 7208, true);
  view.setInt8(4, 1);
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
    ["subscribeScripsLite", "nse_cm|1333"],
    ["snapshotScripsLite", "nse_cm|1333"],
  ]);
  socket.receive(JSON.stringify({
    message_code: 1109,
    error_code: 0,
    data: { "nse_cm|1333": { trading_symbols: "HDFCBANK-EQ" } },
  }));
  socket.receive(createMiniTouchLine());

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

  await reader.cancel();
  await Promise.all(backgroundTasks);
  assert.equal(stream.sseClients.size, 0);
  assert.deepEqual(socket.closeArgs, [1000, "No live market-price clients"]);
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
  const errorEvent = await reader.read();
  assert.match(initial, /"state":"disconnected"/);
  assert.match(decoder.decode(errorEvent.value), /"state":"error".*KOTAK_MARKET_DATA_UCC/);
  assert.equal(FakeWebSocket.instances.length, 0);
  await reader.cancel();
});
