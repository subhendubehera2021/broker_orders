const CONNECTION_REFRESH_MS = 12 * 60 * 1000;
const HANDSHAKE_TIMEOUT_MS = 15 * 1000;
const INITIAL_RETRY_MS = 15 * 1000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const SSE_HEARTBEAT_MS = 15 * 1000;
const MAX_SSE_CLIENTS = 10;
const MAX_SSE_BACKLOG = 100;
const utf8Encoder = new TextEncoder();
const KOTAK_MARKET_DATA_FEED_URL = "wss://sfeed.kotaksecurities.com/apifeed";

const EXCHANGE_IDS = Object.freeze({
  nse_cm: 1,
  nse_fo: 2,
  cde_fo: 3,
  nse_com: 4,
  bse_cm: 5,
  bse_fo: 6,
  bse_cd: 7,
  bse_co: 8,
  mcx_fo: 9,
  ncd_co: 10,
});

function requiredCredential(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required Cloudflare secret ${name}`);
  }
  return value;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMarketInstrument(value) {
  if (typeof value !== "string" || value.length > 128) {
    throw new Error("Enter an instrument as exchange|instrument.");
  }
  const match = /^([a-z0-9_]+)\|([a-z0-9 .&_-]+)$/i.exec(value.trim());
  if (!match) throw new Error("Enter an instrument as exchange|instrument.");

  const exchange = match[1].toLowerCase();
  const instrument = match[2].trim();
  const exchangeId = EXCHANGE_IDS[exchange];
  if (!Object.hasOwn(EXCHANGE_IDS, exchange) || instrument === "") {
    throw new Error("Use a supported Kotak exchange and instrument.");
  }
  const isNumericToken = /^\d+$/.test(instrument);
  const token = isNumericToken ? Number(instrument) : null;
  if (isNumericToken && (!Number.isSafeInteger(token) || token < 1 || token > 0xffff_ffff)) {
    throw new Error("The numeric instrument token is out of range.");
  }

  return {
    inputToken: `${exchange}|${instrument}`,
    exchange,
    exchangeId,
    instrument,
    isIndex: !isNumericToken,
    token,
  };
}

const DEFAULT_MARKET_INSTRUMENT = parseMarketInstrument("nse_cm|Nifty 50");

export function createKotakMarketDataWebSocketUrl(feedUrl) {
  let endpoint;
  try {
    endpoint = new URL(feedUrl);
  } catch {
    throw new Error("Kotak market-data feed URL must be a valid HTTPS or WSS URL");
  }
  if (
    (endpoint.protocol !== "https:" && endpoint.protocol !== "wss:") ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error("Kotak market-data feed URL must be a valid HTTPS or WSS URL");
  }
  if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
  endpoint.hash = "";
  return endpoint.toString();
}

export function createKotakMarketDataAuthPayload(ucc, sid, sdkDate = new Date().toISOString().slice(0, 10)) {
  return JSON.stringify({
    user: requiredCredential(ucc, "KOTAK_MARKET_DATA_UCC"),
    auth: requiredCredential(sid, "KOTAK_WS_SID"),
    format: "native_batch",
    source: "NEOTRADEAPI",
    sdk_version: 1.1,
    sdk_date: sdkDate,
  });
}

function parseJsonMessage(data) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return parseJsonMessage(new TextDecoder().decode(data));
  }
  return null;
}

function toUint8Array(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function scaledPrice(raw, divider, precision) {
  const decimalPlaces = Math.max(0, Math.min(Number(precision) || 0, 8));
  return Number((raw / divider).toFixed(decimalPlaces));
}

export function decodeMarketDataBatch(data, instrument, dividers = {}, receivedAt = new Date().toISOString()) {
  const bytes = toUint8Array(data);
  if (!bytes || bytes.byteLength < 2) return [];

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const prices = [];
  let offset = 0;
  while (offset + 2 <= bytes.byteLength) {
    const packetLength = view.getUint16(offset, true);
    if (packetLength < 9 || offset + packetLength > bytes.byteLength) break;

    const messageCode = view.getUint16(offset + 2, true);
    const exchangeId = view.getInt8(offset + 4);
    const level = view.getUint8(offset + 5);
    const divider = Number(dividers[exchangeId]) > 0 ? Number(dividers[exchangeId]) : 100;
    let price = null;

    if (
      !instrument.isIndex &&
      messageCode === 7208 &&
      level === 1 &&
      packetLength >= 54 &&
      exchangeId === instrument.exchangeId &&
      view.getUint32(offset + 9, true) === instrument.token
    ) {
      const precision = view.getUint8(offset + 49);
      price = {
        inputToken: instrument.inputToken,
        exchange: instrument.exchange,
        instrument: instrument.instrument,
        ltp: scaledPrice(view.getUint32(offset + 21, true), divider, precision),
        change: scaledPrice(view.getInt32(offset + 41, true), divider, precision),
        changePercent: view.getInt32(offset + 37, true) / 100,
        precision,
        receivedAt,
      };
    } else if (
      instrument.isIndex &&
      messageCode === 7207 &&
      packetLength >= 87 &&
      exchangeId === instrument.exchangeId
    ) {
      const precision = view.getUint8(offset + 61);
      const ltp = view.getInt32(offset + 29, true);
      price = {
        inputToken: instrument.inputToken,
        exchange: instrument.exchange,
        instrument: instrument.instrument,
        ltp: scaledPrice(ltp, divider, precision),
        change: scaledPrice(ltp - view.getInt32(offset + 17, true), divider, precision),
        changePercent: view.getInt32(offset + 49, true) / 100,
        precision,
        receivedAt,
      };
    }

    if (price) prices.push(price);
    offset += packetLength;
  }
  return prices;
}

function encodeSseEvent(name, data) {
  return utf8Encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export class KotakMarketPriceStream {
  constructor(ctx, env, WebSocketImpl = globalThis.WebSocket) {
    this.ctx = ctx;
    this.env = env;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.currentInstrument = null;
    this.explicitInstruments = new Map();
    this.instrumentsLoaded = false;
    this.lastPrices = new Map();
    this.tradingSymbols = new Map();
    this.subscribedInstruments = new Set();
    this.acknowledgedInstruments = new Set();
    this.authenticated = false;
    this.connectionState = "disconnected";
    this.lastError = null;
    this.lastPrice = null;
    this.tradingSymbol = null;
    this.dividers = {};
    this.sseClients = new Set();
    this.retryScheduled = false;
    this.retryAttempt = 0;
    this.backgroundMode = false;
    this.backgroundModeLoaded = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/instruments") {
      await this.loadInstrumentSelections();
      return Response.json({ instruments: this.getInstruments() }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method === "POST" && url.pathname === "/subscribe") {
      let instrument;
      try {
        instrument = parseMarketInstrument(url.searchParams.get("instrument"));
      } catch (error) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      try {
        await this.subscribe(instrument);
        return Response.json({ instruments: this.getInstruments() }, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        console.error("[market-price] unable to add market instrument", error);
        return Response.json({ error: error.message }, { status: 503 });
      }
    }
    if (request.method === "POST" && url.pathname === "/unsubscribe") {
      let instrument;
      try {
        instrument = parseMarketInstrument(url.searchParams.get("instrument"));
      } catch (error) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      if (instrument.inputToken === DEFAULT_MARKET_INSTRUMENT.inputToken) {
        return Response.json(
          { error: "The default Nifty 50 instrument cannot be unsubscribed" },
          { status: 400 },
        );
      }
      try {
        await this.unsubscribe(instrument);
        return Response.json({ instruments: this.getInstruments() }, {
          headers: { "Cache-Control": "no-store" },
        });
      } catch (error) {
        console.error("[market-price] unable to remove market instrument", error);
        return Response.json({ error: error.message }, { status: 503 });
      }
    }
    if (request.method === "POST" && url.pathname === "/ensure-default") {
      await this.ensureDefault();
      return Response.json({ ...this.getStatus(), instruments: this.getInstruments() }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (request.method !== "GET" || url.pathname !== "/events") {
      return new Response("Not found", { status: 404 });
    }

    await this.loadInstrumentSelections();

    let instrument;
    try {
      instrument = url.searchParams.has("instrument")
        ? parseMarketInstrument(url.searchParams.get("instrument"))
        : null;
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (this.sseClients.size >= MAX_SSE_CLIENTS) {
      return Response.json(
        { error: "Too many live market-price connections" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (instrument) {
      const selection = this.selectInstrument(instrument).catch((error) => {
        this.authenticated = false;
        this.connectionState = "error";
        this.lastError = error.message;
        this.publishStatus();
        throw error;
      });
      this.runBackground(selection, "unable to select market instrument");
    } else {
      const selection = this.ensureDefault().catch((error) => {
        this.authenticated = false;
        this.connectionState = "error";
        this.lastError = error.message;
        this.publishStatus();
        throw error;
      });
      this.runBackground(selection, "unable to start default market stream");
    }

    if (this.sseClients.size >= MAX_SSE_CLIENTS) {
      return Response.json(
        { error: "Too many live market-price connections" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return this.createEventStream(instrument?.inputToken ?? null);
  }

  createEventStream(instrumentToken) {
    let client;
    const body = new ReadableStream({
      start: (controller) => {
        client = { controller, heartbeat: null, instrumentToken };
        this.sseClients.add(client);
        this.sendToEventClient(client, encodeSseEvent("status", this.getStatus()));
        this.sendToEventClient(client, encodeSseEvent("instruments", this.getInstruments()));
        const prices = instrumentToken
          ? [this.lastPrices.get(instrumentToken)].filter(Boolean)
          : [...this.lastPrices.values()];
        for (const price of prices) {
          this.sendToEventClient(client, encodeSseEvent("price", price));
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

  getInstruments() {
    const instruments = this.getDesiredInstruments();
    return instruments.map((instrument) => ({
      inputToken: instrument.inputToken,
      exchange: instrument.exchange,
      instrument: instrument.instrument,
      symbol: this.tradingSymbols.get(instrument.inputToken) ?? instrument.instrument,
      isDefault: instrument.inputToken === DEFAULT_MARKET_INSTRUMENT.inputToken,
      subscribed: this.subscribedInstruments.has(instrument.inputToken),
      state: this.lastPrices.has(instrument.inputToken)
        ? "live"
        : this.acknowledgedInstruments.has(instrument.inputToken)
          ? "subscribed"
          : this.connectionState,
      price: this.lastPrices.get(instrument.inputToken) ?? null,
    }));
  }

  getDesiredInstruments() {
    const instruments = new Map();
    if (this.backgroundMode || this.currentInstrument || this.explicitInstruments.size) {
      instruments.set(DEFAULT_MARKET_INSTRUMENT.inputToken, DEFAULT_MARKET_INSTRUMENT);
    }
    for (const [inputToken, instrument] of this.explicitInstruments) {
      instruments.set(inputToken, instrument);
    }
    if (this.currentInstrument) {
      instruments.set(this.currentInstrument.inputToken, this.currentInstrument);
    }
    return [...instruments.values()];
  }

  async loadInstrumentSelections() {
    await this.loadBackgroundMode();
    if (this.instrumentsLoaded) return;
    const savedInstruments = await this.ctx.storage.get("marketPriceInstruments");
    if (savedInstruments !== undefined) {
      if (!Array.isArray(savedInstruments)) {
        throw new Error("Stored market instrument list is invalid");
      }
      for (const inputToken of savedInstruments) {
        const instrument = parseMarketInstrument(inputToken);
        if (instrument.inputToken !== DEFAULT_MARKET_INSTRUMENT.inputToken) {
          this.explicitInstruments.set(instrument.inputToken, instrument);
        }
      }
    }
    if (this.explicitInstruments.size) {
      this.backgroundMode = true;
      this.currentInstrument ??= DEFAULT_MARKET_INSTRUMENT;
    }
    this.instrumentsLoaded = true;
  }

  async subscribe(instrument) {
    await this.loadInstrumentSelections();
    if (instrument.inputToken === DEFAULT_MARKET_INSTRUMENT.inputToken) {
      await this.ensureDefault();
      return;
    }
    if (this.explicitInstruments.has(instrument.inputToken)) {
      if (this.socket?.readyState === this.WebSocketImpl.OPEN && this.authenticated) {
        this.subscribeInstrument(instrument);
      }
      return;
    }
    this.explicitInstruments.set(instrument.inputToken, instrument);
    await this.ctx.storage.put("marketPriceInstruments", [...this.explicitInstruments.keys()]);
    this.currentInstrument ??= DEFAULT_MARKET_INSTRUMENT;
    await this.ensureDefault();
    if (this.socket?.readyState === this.WebSocketImpl.OPEN && this.authenticated) {
      this.subscribeInstrument(instrument);
    }
    this.publishStatus();
    this.publishInstruments();
  }

  async unsubscribe(instrument) {
    await this.loadInstrumentSelections();
    if (instrument.inputToken === DEFAULT_MARKET_INSTRUMENT.inputToken) {
      throw new Error("The default Nifty 50 instrument cannot be unsubscribed");
    }
    this.explicitInstruments.delete(instrument.inputToken);
    await this.ctx.storage.put("marketPriceInstruments", [...this.explicitInstruments.keys()]);
    this.unsubscribeInstrument(instrument);
    this.lastPrices.delete(instrument.inputToken);
    this.tradingSymbols.delete(instrument.inputToken);
    if (this.currentInstrument?.inputToken === instrument.inputToken) {
      this.currentInstrument = this.backgroundMode
        ? DEFAULT_MARKET_INSTRUMENT
        : this.explicitInstruments.values().next().value ?? null;
      this.lastPrice = this.currentInstrument
        ? this.lastPrices.get(this.currentInstrument.inputToken) ?? null
        : null;
      this.tradingSymbol = this.currentInstrument
        ? this.tradingSymbols.get(this.currentInstrument.inputToken) ?? null
        : null;
    }
    this.publishEvent("instrument-removed", { inputToken: instrument.inputToken });
    this.publishInstruments();
    this.publishStatus();
  }

  publishInstruments() {
    this.publishEvent("instruments", this.getInstruments());
  }

  getStatus() {
    return {
      state: this.connectionState,
      authenticated: this.authenticated,
      inputToken: this.currentInstrument?.inputToken ?? null,
      symbol: this.tradingSymbol,
      error: this.lastError,
      receivedAt: this.lastPrice?.receivedAt ?? null,
    };
  }

  async selectInstrument(instrument) {
    const previousInstrument = this.currentInstrument;
    const changed = previousInstrument?.inputToken !== instrument.inputToken;
    this.currentInstrument = instrument;
    if (changed) {
      this.lastPrice = this.lastPrices.get(instrument.inputToken) ?? null;
      this.tradingSymbol = this.tradingSymbols.get(instrument.inputToken) ?? null;
      this.lastError = null;
      this.retryAttempt = 0;
      this.retryScheduled = false;
    }

    if (this.socket?.readyState === this.WebSocketImpl.OPEN && this.authenticated) {
      if (
        changed &&
        previousInstrument &&
        previousInstrument.inputToken !== DEFAULT_MARKET_INSTRUMENT.inputToken &&
        !this.explicitInstruments.has(previousInstrument.inputToken)
      ) {
        this.unsubscribeInstrument(previousInstrument);
        this.lastPrices.delete(previousInstrument.inputToken);
        this.tradingSymbols.delete(previousInstrument.inputToken);
      }
      for (const desired of this.getDesiredInstruments()) this.subscribeInstrument(desired);
      this.publishStatus();
      this.publishInstruments();
      return;
    }
    if (
      this.socket &&
      (this.socket.readyState === this.WebSocketImpl.CONNECTING ||
        this.socket.readyState === this.WebSocketImpl.OPEN)
    ) {
      this.publishStatus();
      return;
    }
    if (this.retryScheduled) {
      this.connectionState = "reconnecting";
      this.publishStatus();
      return;
    }

    await this.connect();
  }

  async connect() {
    if (typeof this.WebSocketImpl !== "function") {
      throw new Error("The Cloudflare WebSocket client is unavailable");
    }
    if (!this.currentInstrument) this.currentInstrument = DEFAULT_MARKET_INSTRUMENT;

    const url = createKotakMarketDataWebSocketUrl(
      this.env.KOTAK_MARKET_DATA_FEED_URL ?? KOTAK_MARKET_DATA_FEED_URL,
    );
    const authPayload = createKotakMarketDataAuthPayload(
      this.env.KOTAK_MARKET_DATA_UCC,
      this.env.KOTAK_WS_SID,
    );
    const socket = new this.WebSocketImpl(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.subscribedInstruments.clear();
    this.acknowledgedInstruments.clear();
    this.authenticated = false;
    this.connectionState = "connecting";
    this.lastError = null;
    this.dividers = {};
    this.publishStatus();
    this.publishInstruments();

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      try {
        socket.send(authPayload);
        this.connectionState = "authenticating";
        this.publishStatus();
      } catch (error) {
        this.failConnection(socket, error, "Unable to send market-feed authentication");
      }
    });
    socket.addEventListener("message", (event) => this.onMessage(socket, event.data));
    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      this.lastError = "Kotak market-data WebSocket error";
      this.connectionState = "reconnecting";
      this.publishStatus();
      console.error("[market-price] Kotak market-data WebSocket error");
      socket.close(1011, "Kotak market-data WebSocket error");
    });
    socket.addEventListener("close", (event) => this.onClose(socket, event));

    try {
      await this.ctx.storage.setAlarm(Date.now() + HANDSHAKE_TIMEOUT_MS);
    } catch (error) {
      if (this.socket === socket) this.socket = null;
      this.connectionState = "disconnected";
      socket.close(1011, "Unable to schedule connection refresh");
      this.publishStatus();
      throw error;
    }
    console.log(`[market-price] connecting host=${new URL(url).hostname}`);
  }

  onMessage(socket, data) {
    if (this.socket !== socket) return;
    if (typeof data === "string" || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const message = parseJsonMessage(data);
      if (isRecord(message)) {
        this.onTextMessage(socket, message);
        return;
      }
    }

    for (const instrument of this.getDesiredInstruments()) {
      for (const price of decodeMarketDataBatch(data, instrument, this.dividers)) {
        const tick = {
          ...price,
          symbol: this.tradingSymbols.get(instrument.inputToken) ??
            (instrument.inputToken === this.currentInstrument?.inputToken
              ? this.tradingSymbol
              : null) ??
            instrument.instrument,
        };
        this.lastPrices.set(instrument.inputToken, tick);
        if (instrument.inputToken === this.currentInstrument?.inputToken) {
          this.lastPrice = tick;
        }
        if (this.connectionState !== "live") {
          this.retryAttempt = 0;
          this.runBackground(
            this.ctx.storage.setAlarm(Date.now() + CONNECTION_REFRESH_MS),
            "unable to schedule market-feed refresh",
          );
        }
        this.connectionState = "live";
        this.lastError = null;
        this.publishEvent("price", tick);
        this.publishStatus();
      }
    }
  }

  onTextMessage(socket, message) {
    if (message.message_code === 1119) {
      if (message.format === "native_fallback") {
        this.failConnection(socket, new Error("Unsupported market-data format"), "Kotak returned an unsupported market-data format");
        return;
      }
      this.storeDividers(message.exchanges);
      this.publishStatus();
      return;
    }
    if (message.message_code === 1117) {
      if (message.format === "native_fallback") {
        this.failConnection(socket, new Error("Unsupported market-data format"), "Kotak returned an unsupported market-data format");
        return;
      }
      this.storeDividers(message.exchanges);
      this.authenticated = true;
      this.connectionState = "subscribing";
      this.lastError = null;
      this.retryScheduled = false;
      this.runBackground(
        this.ctx.storage.setAlarm(Date.now() + HANDSHAKE_TIMEOUT_MS),
        "unable to schedule market-feed subscription timeout",
      );
      for (const instrument of this.getDesiredInstruments()) {
        this.subscribeInstrument(instrument);
      }
      this.publishStatus();
      this.publishInstruments();
      return;
    }
    if (message.message_code === 1120) {
      const description = typeof message.message === "string" ? message.message : "Kotak authentication failed";
      this.failConnection(socket, new Error(description), "Kotak rejected market-feed authentication");
      return;
    }
    if (message.message_code === 1109) {
      if (Number(message.error_code) !== 0) {
        const description = typeof message.description === "string"
          ? message.description
          : "Kotak rejected the instrument subscription";
        this.failConnection(
          socket,
          new Error(description),
          `Kotak rejected instrument subscription: ${description}`,
        );
        return;
      }
      if (isRecord(message.data)) {
        for (const [inputToken, entry] of Object.entries(message.data)) {
          this.acknowledgedInstruments.add(inputToken);
          if (typeof entry?.trading_symbols === "string") {
            this.tradingSymbols.set(inputToken, entry.trading_symbols);
            if (inputToken === this.currentInstrument?.inputToken) {
              this.tradingSymbol = entry.trading_symbols;
            }
          }
        }
      }
      const desiredInstruments = this.getDesiredInstruments();
      if (desiredInstruments.some(({ inputToken }) => !this.acknowledgedInstruments.has(inputToken))) {
        this.connectionState = "subscribing";
        this.publishStatus();
        this.publishInstruments();
        return;
      }
      this.connectionState = this.lastPrice || this.lastPrices.size ? "live" : "subscribed";
      this.lastError = null;
      this.retryAttempt = 0;
      this.runBackground(
        this.ctx.storage.setAlarm(Date.now() + CONNECTION_REFRESH_MS),
        "unable to schedule market-feed refresh",
      );
      this.publishStatus();
      this.publishInstruments();
    }
  }

  storeDividers(exchanges) {
    if (!isRecord(exchanges)) return;
    for (const [exchange, details] of Object.entries(exchanges)) {
      const exchangeId = EXCHANGE_IDS[exchange];
      const divider = Number(details?.divider);
      if (Object.hasOwn(EXCHANGE_IDS, exchange) && Number.isFinite(divider) && divider > 0) {
        this.dividers[exchangeId] = divider;
      }
    }
  }

  subscribeInstrument(instrument = this.currentInstrument) {
    if (
      !this.socket ||
      this.socket.readyState !== this.WebSocketImpl.OPEN ||
      !this.authenticated ||
      !instrument ||
      this.subscribedInstruments.has(instrument.inputToken)
    ) {
      return;
    }
    const suffix = instrument.isIndex ? "Indices" : "ScripsLite";
    const inputtoken = instrument.inputToken;
    try {
      this.socket.send(JSON.stringify({
        event: `subscribe${suffix}`,
        inputtoken,
        ack_symbol: true,
      }));
      this.socket.send(JSON.stringify({
        event: `snapshot${suffix}`,
        inputtoken,
        ack_symbol: true,
      }));
      this.subscribedInstruments.add(inputtoken);
      this.connectionState = "subscribing";
      this.lastError = null;
    } catch (error) {
      this.failConnection(this.socket, error, "Unable to subscribe to market instrument");
    }
  }

  unsubscribeInstrument(instrument) {
    if (
      !this.socket ||
      this.socket.readyState !== this.WebSocketImpl.OPEN ||
      !instrument ||
      instrument.inputToken === DEFAULT_MARKET_INSTRUMENT.inputToken ||
      !this.subscribedInstruments.has(instrument.inputToken)
    ) return;
    const suffix = instrument.isIndex ? "Indices" : "ScripsLite";
    try {
      this.socket.send(JSON.stringify({
        event: `unsubscribe${suffix}`,
        inputtoken: instrument.inputToken,
      }));
      this.subscribedInstruments.delete(instrument.inputToken);
      this.acknowledgedInstruments.delete(instrument.inputToken);
    } catch (error) {
      this.failConnection(this.socket, error, "Unable to unsubscribe from previous market instrument");
    }
  }

  failConnection(socket, error, message) {
    this.lastError = message;
    this.connectionState = "error";
    console.error(`[market-price] ${message}`, error);
    this.publishStatus();
    this.publishInstruments();
    if (socket?.readyState < this.WebSocketImpl.CLOSING) {
      socket.close(1011, message);
    }
  }

  onClose(socket, event) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.authenticated = false;
    this.subscribedInstruments.clear();
    this.acknowledgedInstruments.clear();
    if ((this.sseClients.size === 0 && !this.backgroundMode) || !this.currentInstrument) {
      this.connectionState = "disconnected";
      this.publishStatus();
      this.publishInstruments();
      return;
    }
    this.connectionState = "reconnecting";
    if (!this.lastError) this.lastError = `Market-data connection closed (${event.code})`;
    console.warn(`[market-price] Kotak market-data connection closed code=${event.code}`);
    this.publishInstruments();
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (
      this.retryScheduled ||
      (this.sseClients.size === 0 && !this.backgroundMode) ||
      !this.currentInstrument
    ) return;
    this.retryAttempt += 1;
    const delay = Math.min(INITIAL_RETRY_MS * 2 ** (this.retryAttempt - 1), MAX_RETRY_MS);
    this.retryScheduled = true;
    this.connectionState = "reconnecting";
    const alarm = this.ctx.storage.setAlarm(Date.now() + delay);
    this.runBackground(alarm, "unable to schedule market-feed reconnect");
    this.publishStatus();
  }

  async alarm() {
    await this.loadInstrumentSelections();
    if (!this.currentInstrument && this.backgroundMode) {
      this.currentInstrument = DEFAULT_MARKET_INSTRUMENT;
    }
    this.retryScheduled = false;
    if (!this.currentInstrument || (this.sseClients.size === 0 && !this.backgroundMode)) return;

    const previousState = this.connectionState;
    const previousSocket = this.socket;
    this.socket = null;
    this.authenticated = false;
    if (previousSocket && previousSocket.readyState < this.WebSocketImpl.CLOSING) {
      previousSocket.close(1000, "Refreshing Kotak market-data connection");
    }

    if (["connecting", "authenticating", "subscribing"].includes(previousState)) {
      this.lastError = `Kotak market-data ${previousState} timed out`;
      this.connectionState = "reconnecting";
      this.scheduleReconnect();
      return;
    }

    this.connectionState = "connecting";
    try {
      await this.connect();
    } catch (error) {
      console.error("[market-price] market-feed reconnect attempt failed", error);
      this.lastError = "Unable to reconnect to Kotak market data";
      this.connectionState = "reconnecting";
      this.scheduleReconnect();
    }
  }

  removeEventClient(client) {
    if (!client || !this.sseClients.delete(client)) return;
    if (client.heartbeat !== null) clearInterval(client.heartbeat);
    if (this.sseClients.size !== 0) return;
    this.runBackground(this.stop(), "unable to stop market feed after last client disconnected");
  }

  async stop() {
    if (this.backgroundMode) {
      for (const instrument of this.getDesiredInstruments()) {
        if (
          instrument.inputToken !== DEFAULT_MARKET_INSTRUMENT.inputToken &&
          !this.explicitInstruments.has(instrument.inputToken)
        ) {
          this.unsubscribeInstrument(instrument);
          this.lastPrices.delete(instrument.inputToken);
          this.tradingSymbols.delete(instrument.inputToken);
        }
      }
      this.currentInstrument = DEFAULT_MARKET_INSTRUMENT;
      this.lastPrice = this.lastPrices.get(DEFAULT_MARKET_INSTRUMENT.inputToken) ?? null;
      this.tradingSymbol =
        this.tradingSymbols.get(DEFAULT_MARKET_INSTRUMENT.inputToken) ?? null;
      if (this.socket?.readyState === this.WebSocketImpl.OPEN && this.authenticated) {
        this.connectionState = "subscribed";
        this.lastError = null;
      }
      this.publishStatus();
      this.publishInstruments();
      return;
    }

    const socket = this.socket;
    this.socket = null;
    this.currentInstrument = null;
    this.authenticated = false;
    this.connectionState = "disconnected";
    this.lastError = null;
    this.lastPrice = null;
    this.tradingSymbol = null;
    this.lastPrices.clear();
    this.tradingSymbols.clear();
    this.subscribedInstruments.clear();
    this.acknowledgedInstruments.clear();
    this.retryScheduled = false;
    this.retryAttempt = 0;
    if (socket && socket.readyState < this.WebSocketImpl.CLOSING) {
      socket.close(1000, "No live market-price clients");
    }
    await this.ctx.storage.deleteAlarm();
  }

  async ensureDefault() {
    await this.loadInstrumentSelections();
    if (!this.backgroundMode) {
      await this.ctx.storage.put("backgroundMode", true);
      this.backgroundMode = true;
    }
    this.currentInstrument ??= DEFAULT_MARKET_INSTRUMENT;

    if (this.socket?.readyState === this.WebSocketImpl.OPEN && this.authenticated) {
      for (const instrument of this.getDesiredInstruments()) {
        this.subscribeInstrument(instrument);
      }
      this.publishStatus();
      this.publishInstruments();
      return;
    }
    if (
      this.socket &&
      (this.socket.readyState === this.WebSocketImpl.CONNECTING ||
        this.socket.readyState === this.WebSocketImpl.OPEN)
    ) {
      this.publishInstruments();
      return;
    }
    if (this.retryScheduled) return;

    await this.connect();
    this.publishInstruments();
  }

  async loadBackgroundMode() {
    if (this.backgroundModeLoaded) return;
    this.backgroundMode = await this.ctx.storage.get("backgroundMode") === true;
    this.backgroundModeLoaded = true;
  }

  runBackground(promise, message) {
    if (typeof this.ctx.waitUntil === "function") {
      this.ctx.waitUntil(promise.catch((error) => console.error(`[market-price] ${message}`, error)));
    } else {
      promise.catch((error) => console.error(`[market-price] ${message}`, error));
    }
  }

  publishStatus() {
    this.publishEvent("status", this.getStatus());
  }

  publishEvent(name, data) {
    const chunk = encodeSseEvent(name, data);
    for (const client of this.sseClients) {
      if (
        name === "price" &&
        client.instrumentToken &&
        client.instrumentToken !== data.inputToken
      ) continue;
      this.sendToEventClient(client, chunk);
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
}
