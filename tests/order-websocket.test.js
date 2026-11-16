import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKotakOrderWebSocketUrl,
  createKotakWebSocketAuthPayload,
  KotakOrderStream,
} from "../src/order-websocket.js";

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
    this.closeArgs = undefined;
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
    },
    waitUntil(promise) {
      backgroundTasks.push(promise);
    },
  };
  const env = {
    KOTAK_NEO_BASE_URL: "https://e21.kotaksecurities.com",
    KOTAK_WS_SESSION_TOKEN: "session-token",
    KOTAK_WS_SID: "session-id",
  };
  return {
    stream: new KotakOrderStream(ctx, env, FakeWebSocket),
    alarms,
    backgroundTasks,
  };
}

test("builds the Kotak realtime URL and raw authentication payload", () => {
  assert.equal(
    createKotakOrderWebSocketUrl("https://e21.kotaksecurities.com"),
    "wss://e21.kotaksecurities.com/realtime",
  );
  assert.equal(
    createKotakWebSocketAuthPayload("session-token", "session-id"),
    "{type:cn,Authorization:session-token,Sid:session-id,src:WEB}",
  );
  assert.throws(
    () => createKotakOrderWebSocketUrl("https://example.com"),
    /Kotak Securities URL/,
  );
});

test("opens one socket and sends raw session authentication after open", async () => {
  FakeWebSocket.instances = [];
  const { stream, alarms } = createStream();
  const startedAt = Date.now();

  assert.equal(await stream.start(), "connecting");
  assert.equal(await stream.start(), "connecting");
  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(FakeWebSocket.instances[0].url, "wss://e21.kotaksecurities.com/realtime");
  assert.equal(alarms.length, 1);
  assert.ok(alarms[0] >= startedAt + 12 * 60 * 1000);
  assert.ok(alarms[0] <= Date.now() + 12 * 60 * 1000);

  FakeWebSocket.instances[0].open();
  assert.deepEqual(FakeWebSocket.instances[0].sent, [
    "{type:cn,Authorization:session-token,Sid:session-id,src:WEB}",
  ]);
  FakeWebSocket.instances[0].receive(JSON.stringify({ ak: "ok", type: "cn" }));
  assert.equal(await stream.start(), "connected");
});

test("logs sanitized order and position summaries without sensitive fields", async () => {
  FakeWebSocket.instances = [];
  const { stream } = createStream();
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => messages.push(message);

  try {
    await stream.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive(JSON.stringify({
      type: "order",
      data: { ordSt: "complete", sym: "NIFTY26N1725300CE", avgPrc: "250", nOrdNo: "private-order" },
    }));
    socket.receive(JSON.stringify({
      type: "position",
      data: { sym: "NIFTY26N1725300CE", exSeg: "nse_fo", prod: "MIS", actId: "private-account" },
    }));
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(messages, [
    "[order-websocket] connecting host=e21.kotaksecurities.com",
    "[order-websocket] order status=\"complete\" symbol=\"NIFTY26N1725300CE\"",
    "[order-websocket] position symbol=\"NIFTY26N1725300CE\" exchange=\"nse_fo\" product=\"MIS\"",
  ]);
  assert.equal(messages.some((message) => message.includes("private-")), false);
  assert.equal(messages.some((message) => message.includes("250")), false);
});

test("reconnects after a rejected authentication response", async () => {
  FakeWebSocket.instances = [];
  const { stream, alarms, backgroundTasks } = createStream();
  const originalError = console.error;
  const originalWarn = console.warn;
  const startedAt = Date.now();
  console.error = () => {};
  console.warn = () => {};

  try {
    await stream.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive(JSON.stringify({ ak: "no", type: "cn" }));
    assert.deepEqual(socket.closeArgs, [4001, "Kotak authentication rejected"]);
    assert.equal(alarms.length, 2);
    assert.ok(alarms[1] >= startedAt + 15_000);
    assert.ok(alarms[1] <= Date.now() + 15_000);
    await Promise.all(backgroundTasks);
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});

test("refreshes the socket when its rotation alarm fires", async () => {
  FakeWebSocket.instances = [];
  const { stream } = createStream();
  await stream.start();
  const previousSocket = FakeWebSocket.instances[0];

  await stream.alarm();

  assert.deepEqual(previousSocket.closeArgs, [1000, "Refreshing Kotak connection"]);
  assert.equal(FakeWebSocket.instances.length, 2);
  assert.equal(stream.socket, FakeWebSocket.instances[1]);
});

test("requires session credentials before opening a socket", async () => {
  FakeWebSocket.instances = [];
  const { stream } = createStream();
  stream.env.KOTAK_WS_SID = "";

  await assert.rejects(stream.start(), /KOTAK_WS_SID/);
  assert.equal(FakeWebSocket.instances.length, 0);
});
