const CONNECTION_REFRESH_MS = 12 * 60 * 1000;
const INITIAL_RETRY_MS = 15 * 1000;
const MAX_RETRY_MS = 5 * 60 * 1000;

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
    this.retryScheduled = false;
    this.retryAttempt = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/status") {
      return Response.json(this.getStatus(), {
        headers: { "Cache-Control": "no-store" },
      });
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
      console.error("[order-websocket] Kotak WebSocket error");
      socket.close(1011, "Kotak WebSocket error");
    });
    socket.addEventListener("close", (event) => this.onClose(socket, event));

    try {
      await this.ctx.storage.setAlarm(Date.now() + CONNECTION_REFRESH_MS);
    } catch (error) {
      this.socket = null;
      socket.close(1011, "Unable to schedule connection refresh");
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
    if (!isRecord(message)) {
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
      return;
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
