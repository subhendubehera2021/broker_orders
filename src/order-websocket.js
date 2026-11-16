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
  return null;
}

function logValue(value) {
  return JSON.stringify(typeof value === "string" || typeof value === "number" ? String(value) : "-");
}

export class KotakOrderStream {
  constructor(ctx, env, WebSocketImpl = globalThis.WebSocket) {
    this.ctx = ctx;
    this.env = env;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.authenticated = false;
    this.retryScheduled = false;
    this.retryAttempt = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/start") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const state = await this.start();
      return Response.json({ state });
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
    this.socket = socket;
    this.authenticated = false;

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
    const message = parseMessage(data);
    if (!isRecord(message)) {
      console.warn("[order-websocket] ignored malformed message");
      return;
    }

    if (message.type === "cn") {
      if (message.ak === "ok") {
        this.authenticated = true;
        this.retryAttempt = 0;
        this.retryScheduled = false;
        console.log("[order-websocket] authenticated");
      } else {
        console.error("[order-websocket] Kotak rejected WebSocket authentication");
        socket.close(4001, "Kotak authentication rejected");
      }
      return;
    }

    if (!isRecord(message.data)) {
      console.warn(`[order-websocket] ignored ${logValue(message.type)} message without data`);
      return;
    }

    if (message.type === "order") {
      console.log(
        `[order-websocket] order status=${logValue(message.data.ordSt)}` +
          ` symbol=${logValue(message.data.sym)}`,
      );
    } else if (message.type === "position") {
      console.log(
        `[order-websocket] position symbol=${logValue(message.data.sym)}` +
          ` exchange=${logValue(message.data.exSeg)} product=${logValue(message.data.prod)}`,
      );
    }
  }

  onClose(socket, event) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.authenticated = false;
    console.warn(`[order-websocket] Kotak connection closed code=${event.code}`);
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.retryScheduled) return;
    this.retryAttempt += 1;
    const delay = Math.min(INITIAL_RETRY_MS * 2 ** (this.retryAttempt - 1), MAX_RETRY_MS);
    this.retryScheduled = true;
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
