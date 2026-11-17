import { parseMarketInstrument } from "./market-price/market-price-stream.js";

const CONNECTION_REFRESH_MS = 12 * 60 * 1000;
const INITIAL_RETRY_MS = 15 * 1000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const SSE_HEARTBEAT_MS = 15 * 1000;
const MAX_SSE_CLIENTS = 10;
const MAX_SSE_BACKLOG = 100;
const MAX_RECENT_STREAM_EVENTS = 50;
const MAX_STREAM_PREVIEW_LENGTH = 16_384;
const utf8Encoder = new TextEncoder();

function encodeSseEvent(name, data) {
  return utf8Encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredCredential(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required Cloudflare secret ${name}`);
  }
  return value;
}

export function createKotakOrderWebSocketUrl(baseUrl) {
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw new Error("KOTAK_NEO_BASE_URL must be a valid HTTPS Kotak Securities URL");
  }

  if (
    endpoint.protocol !== "https:" ||
    (endpoint.hostname !== "kotaksecurities.com" &&
      !endpoint.hostname.endsWith(".kotaksecurities.com"))
  ) {
    throw new Error("KOTAK_NEO_BASE_URL must be a valid HTTPS Kotak Securities URL");
  }

  endpoint.protocol = "wss:";
  endpoint.pathname = "/realtime";
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

export function createKotakWebSocketAuthPayload(token, sid) {
  const sessionToken = requiredCredential(token, "KOTAK_WS_SESSION_TOKEN");
  const sessionId = requiredCredential(sid, "KOTAK_WS_SID");
  return `{type:cn,Authorization:${sessionToken},Sid:${sessionId},src:WEB}`;
}

function parseMessage(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (data instanceof ArrayBuffer) {
    return parseMessage(new TextDecoder().decode(data));
  }
  if (ArrayBuffer.isView(data)) {
    return parseMessage(new TextDecoder().decode(data));
  }
  return null;
}

function messageText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

export class KotakOrderStream {
  constructor(ctx, env, WebSocketImpl = globalThis.WebSocket) {
    this.ctx = ctx;
    this.env = env;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.authenticated = false;
    this.connectionState = "disconnected";
    this.lastMessageAt = null;
    this.lastMessageType = null;
    this.recentEvents = [];
    this.eventSequence = 0;
    this.sseClients = new Set();
    this.retryScheduled = false;
    this.retryAttempt = 0;
    this.pendingMarketSubscriptions = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/status") {
      return Response.json(this.getStatus(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method === "GET" && url.pathname === "/events") {
      return this.createEventStream();
    }
    if (request.method !== "POST" || url.pathname !== "/start") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const state = await this.start();
      return Response.json(
        { state },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      console.error("[order-websocket] unable to start Kotak connection", error);
      return Response.json({ error: "Unable to start Kotak order stream" }, { status: 503 });
    }
  }

  async start() {
    if (
      this.socket &&
      (this.socket.readyState === this.WebSocketImpl.CONNECTING ||
        this.socket.readyState === this.WebSocketImpl.OPEN)
    ) {
      return this.authenticated ? "connected" : "connecting";
    }
    if (this.retryScheduled) return "retry-scheduled";

    await this.connect();
    return "connecting";
  }

  getStatus() {
    return {
      state: this.connectionState,
      authenticated: this.authenticated,
      lastMessageAt: this.lastMessageAt,
      lastMessageType: this.lastMessageType,
    };
  }

  createEventStream() {
    if (this.sseClients.size >= MAX_SSE_CLIENTS) {
      return Response.json(
        { error: "Too many live dashboard connections" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    let client;
    const body = new ReadableStream({
      start: (controller) => {
        client = { controller, heartbeat: null };
        this.sseClients.add(client);
        this.sendToEventClient(client, encodeSseEvent("status", this.getStatus()));
        for (const event of this.recentEvents) {
          this.sendToEventClient(client, encodeSseEvent("stream", event));
        }
        client.heartbeat = setInterval(() => {
          this.sendToEventClient(client, utf8Encoder.encode(": keep-alive\n\n"));
        }, SSE_HEARTBEAT_MS);
      },
      cancel: () => this.removeEventClient(client),
    });

    return new Response(body, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  }

  removeEventClient(client) {
    if (!client || !this.sseClients.delete(client)) return;
    if (client.heartbeat !== null) clearInterval(client.heartbeat);
  }

  publishEvent(name, data) {
    for (const client of this.sseClients) {
      this.sendToEventClient(client, encodeSseEvent(name, data));
    }
  }

  sendToEventClient(client, chunk) {
    try {
      if (client.controller.desiredSize < -MAX_SSE_BACKLOG) {
        this.removeEventClient(client);
        client.controller.error(new Error("SSE client is not keeping up"));
        return;
      }
      client.controller.enqueue(chunk);
    } catch {
      this.removeEventClient(client);
    }
  }

  publishStatus() {
    this.publishEvent("status", this.getStatus());
  }

  async connect() {
    if (typeof this.WebSocketImpl !== "function") {
      throw new Error("The Cloudflare WebSocket client is unavailable");
    }

    const url = createKotakOrderWebSocketUrl(this.env.KOTAK_NEO_BASE_URL);
    const authPayload = createKotakWebSocketAuthPayload(
      this.env.KOTAK_WS_SESSION_TOKEN,
      this.env.KOTAK_WS_SID,
    );
    const socket = new this.WebSocketImpl(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.authenticated = false;
    this.connectionState = "connecting";
    this.publishStatus();

    socket.addEventListener("open", () => {
      try {
        socket.send(authPayload);
      } catch (error) {
        console.error("[order-websocket] failed to send authentication payload", error);
        socket.close(1011, "Authentication send failed");
      }
    });
    socket.addEventListener("message", (event) => this.onMessage(socket, event.data));
    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      this.connectionState = "reconnecting";
      this.publishStatus();
      console.error("[order-websocket] Kotak WebSocket error");
      socket.close(1011, "Kotak WebSocket error");
    });
    socket.addEventListener("close", (event) => this.onClose(socket, event));

    try {
      await this.ctx.storage.setAlarm(Date.now() + CONNECTION_REFRESH_MS);
    } catch (error) {
      this.socket = null;
      this.connectionState = "disconnected";
      socket.close(1011, "Unable to schedule connection refresh");
      this.publishStatus();
      throw error;
    }
    console.log(`[order-websocket] connecting host=${new URL(url).hostname}`);
  }

  onMessage(socket, data) {
    if (this.socket !== socket) return;
    const rawData = messageText(data);
    console.log("[order-websocket] incoming data", rawData);
    const message = parseMessage(rawData);
    this.lastMessageAt = new Date().toISOString();
    this.lastMessageType =
      isRecord(message) && typeof message.type === "string" ? message.type : "unparsed";
    const streamEvent = {
      id: `${this.lastMessageAt}:${++this.eventSequence}`,
      receivedAt: this.lastMessageAt,
      type: this.lastMessageType,
      data: rawData.slice(0, MAX_STREAM_PREVIEW_LENGTH),
      truncated: rawData.length > MAX_STREAM_PREVIEW_LENGTH,
    };
    this.recentEvents.push(streamEvent);
    if (this.recentEvents.length > MAX_RECENT_STREAM_EVENTS) this.recentEvents.shift();
    if (!isRecord(message)) {
      this.publishStatus();
      this.publishEvent("stream", streamEvent);
      console.warn("[order-websocket] ignored malformed message");
      return;
    }

    if (message.type === "cn") {
      if (message.ak === "ok") {
        this.authenticated = true;
        this.connectionState = "connected";
        this.retryAttempt = 0;
        this.retryScheduled = false;
        console.log("[order-websocket] authenticated");
      } else {
        this.connectionState = "reconnecting";
        console.error("[order-websocket] Kotak rejected WebSocket authentication");
        socket.close(4001, "Kotak authentication rejected");
      }
    }
    if (message.type === "order") {
      this.subscribeOrderInstrument(message);
    }
    this.publishStatus();
    this.publishEvent("stream", streamEvent);
  }

  subscribeOrderInstrument(message) {
    const data = message.data;
    if (!isRecord(data)) return;
    const hasExchange = Object.hasOwn(data, "exSeg");
    const hasToken = Object.hasOwn(data, "tok");
    if (!hasExchange && !hasToken) return;
    if (
      typeof data.exSeg !== "string" ||
      (typeof data.tok !== "string" && typeof data.tok !== "number")
    ) {
      console.warn("[order-websocket] order is missing exSeg or tok; market-price subscription skipped");
      return;
    }

    let inputToken;
    try {
      inputToken = parseMarketInstrument(`${data.exSeg}|${data.tok}`).inputToken;
    } catch (error) {
      console.warn("[order-websocket] order has an unsupported market instrument", error.message);
      return;
    }
    if (this.pendingMarketSubscriptions.has(inputToken)) return;

    const marketPriceStream = this.env.MARKET_PRICE_STREAM;
    if (!marketPriceStream) {
      console.error("[order-websocket] market-price Durable Object binding is unavailable");
      return;
    }

    this.pendingMarketSubscriptions.add(inputToken);
    const request = Promise.resolve().then(() => {
      const id = marketPriceStream.idFromName("kotak-market-price-stream");
      return marketPriceStream.get(id).fetch(
        `https://market-price.internal/subscribe?instrument=${encodeURIComponent(inputToken)}`,
        { method: "POST" },
      );
    }).then(async (response) => {
      if (response.ok) {
        console.log(`[order-websocket] market-price subscription accepted instrument=${inputToken}`);
        return;
      }
      const result = await response.json().catch(() => ({}));
      throw new Error(
        result.error ?? `Market-price subscription failed with status ${response.status}`,
      );
    }).catch((error) => {
      console.error(
        `[order-websocket] unable to subscribe ${inputToken} to live prices`,
        error,
      );
    }).finally(() => {
      this.pendingMarketSubscriptions.delete(inputToken);
    });

    if (typeof this.ctx.waitUntil === "function") {
      this.ctx.waitUntil(request);
    }
  }

  onClose(socket, event) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.authenticated = false;
    this.connectionState = "reconnecting";
    console.warn(`[order-websocket] Kotak connection closed code=${event.code}`);
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.retryScheduled) return;
    this.retryAttempt += 1;
    const delay = Math.min(INITIAL_RETRY_MS * 2 ** (this.retryAttempt - 1), MAX_RETRY_MS);
    this.retryScheduled = true;
    this.connectionState = "reconnecting";
    const alarm = this.ctx.storage.setAlarm(Date.now() + delay);
    if (typeof this.ctx.waitUntil === "function") {
      this.ctx.waitUntil(alarm);
    } else {
      alarm.catch((error) => console.error("[order-websocket] unable to schedule reconnect", error));
    }
    console.warn(`[order-websocket] reconnect scheduled delayMs=${delay}`);
    this.publishStatus();
  }

  async alarm() {
    this.retryScheduled = false;
    const previousSocket = this.socket;
    this.socket = null;
    this.authenticated = false;
    this.connectionState = "connecting";
    if (previousSocket && previousSocket.readyState < this.WebSocketImpl.CLOSING) {
      previousSocket.close(1000, "Refreshing Kotak connection");
    }

    try {
      await this.connect();
    } catch (error) {
      console.error("[order-websocket] reconnect attempt failed", error);
      this.scheduleReconnect();
    }
  }
}
