import type { KotakNeoConfig } from "./config.js";

interface LoginInput {
  mobileNumber: string;
  ucc: string;
  totp: string;
  mpin: string;
}

export interface AuthenticatedSession {
  sid: string;
  tradeToken: string;
  baseUrl?: string;
  feedUrl?: string;
  user?: string;
  rid?: string;
  serverId?: string;
}

export interface NiftyIndexTick {
  price: number;
  asOf: string;
}

export interface NiftyOptionMarketInstrument {
  instrumentToken: string;
  tradingSymbol: string;
}

export interface NiftyOptionPriceTick {
  tradingSymbol: string;
  price: number;
  asOf: string;
}

interface MarketDataSocket {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface MarginCheckInput {
  brkName: string;
  brnchId: string;
  exSeg: string;
  prc: string;
  prcTp: string;
  prod: string;
  qty: string;
  tok: string;
  trnsTp: string;
}

export interface QuoteInstrument {
  instrumentToken: string;
  exchangeSegment: string;
}

export interface PlaceNiftyOptionOrderInput {
  tradingSymbol: string;
  instrumentToken: string;
  transactionType: "B" | "S";
  quantity: string;
  product: "NRML" | "MIS" | "CNC" | "CO" | "BO" | "MTF";
  orderType: "L" | "MKT" | "SL" | "SL-M";
  price: string;
  validity: "DAY" | "IOC";
  amo: "YES" | "NO";
  disclosedQuantity: string;
  marketProtection: string;
  triggerPrice: string;
  tag?: string;
  squareOffType?: "Absolute" | "Ticks";
  stopLossType?: "Absolute" | "Ticks";
  stopLossValue?: string;
  squareOffValue?: string;
  trailingStopLoss?: "Y" | "N";
  trailingSlValue?: string;
  lastTradedPrice?: string;
}

interface KotakResponse {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

type LoginResponseStage = "totp-login" | "totp-validate";
type LoginResponseLogger = (stage: LoginResponseStage, response: unknown) => void;

export class KotakNeoError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "KotakNeoError";
  }
}

export class KotakNeoClient {
  constructor(
    private readonly config: KotakNeoConfig & { consumerKey: string },
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly webSocketFactory: (url: string) => MarketDataSocket = (url) =>
      new WebSocket(url),
    private readonly loginResponseLogger?: LoginResponseLogger,
  ) {}

  async login(input: LoginInput): Promise<AuthenticatedSession> {
    const commonHeaders = {
      Authorization: this.config.consumerKey,
      "neo-fin-key": this.config.financialKey,
    };

    const viewResponse = await this.post(
      this.config.totpLoginPath,
      {
        ...commonHeaders,
        "Content-Type": "application/json",
      },
      {
        mobileNumber: input.mobileNumber,
        ucc: input.ucc,
        totp: input.totp,
      },
    );
    this.loginResponseLogger?.("totp-login", redactKotakResponse(viewResponse));
    const viewToken = requiredString(viewResponse.data?.token);
    const viewSid = requiredString(viewResponse.data?.sid);

    const tradeResponse = await this.post(
      this.config.totpValidatePath,
      {
        ...commonHeaders,
        "Content-Type": "application/json",
        sid: viewSid,
        Auth: viewToken,
      },
      { mpin: input.mpin },
    );
    this.loginResponseLogger?.("totp-validate", redactKotakResponse(tradeResponse));
    const tradeToken = requiredString(tradeResponse.data?.token);
    const sid = optionalString(tradeResponse.data?.sid) ?? viewSid;
    const baseUrl = brokerBaseUrl(tradeResponse.data?.baseUrl);

    return {
      sid,
      tradeToken,
      ...(baseUrl ? { baseUrl } : {}),
      feedUrl: optionalString(tradeResponse.data?.feedUrl),
      user: input.ucc,
      rid: optionalString(tradeResponse.data?.rid),
      serverId:
        optionalString(tradeResponse.data?.hsServerId) ??
        optionalString(viewResponse.data?.hsServerId),
    };
  }

  streamNiftyIndexPrice(
    session: AuthenticatedSession,
    onPrice: (tick: NiftyIndexTick) => void,
    onError: (error: Error) => void,
  ): () => void {
    return this.streamNiftyMarketData(session, [], () => [], onPrice, () => {}, onError);
  }

  streamNiftyMarketData(
    session: AuthenticatedSession,
    optionInstruments: NiftyOptionMarketInstrument[],
    selectOptions: (spotPrice: number) => NiftyOptionMarketInstrument[],
    onIndexPrice: (tick: NiftyIndexTick) => void,
    onOptionPrice: (tick: NiftyOptionPriceTick) => void,
    onError: (error: Error) => void,
    onConnected: () => void = () => {},
  ): () => void {
    if (!session.feedUrl || !session.user) {
      onError(new KotakNeoError("Kotak market-data feed details are missing; sign in again", 503));
      return () => {};
    }

    let socket: MarketDataSocket;
    try {
      socket = this.webSocketFactory(toWebSocketUrl(session.feedUrl));
    } catch {
      onError(new KotakNeoError("Could not connect to the Kotak market-data feed", 503));
      return () => {};
    }

    let stopped = false;
    let authenticated = false;
    let indexDivider = 100;
    let optionDivider = 100;
    let errorReported = false;
    let subscribedOptions = new Map<string, NiftyOptionMarketInstrument>();
    const optionInstrumentsByToken = new Map(
      optionInstruments.map((instrument) => [
        Number(instrument.instrumentToken),
        instrument,
      ]),
    );

    const reportError = (error: Error) => {
      if (stopped || errorReported) return;
      errorReported = true;
      onError(error);
    };
    const updateOptionSubscriptions = (spotPrice: number) => {
      if (optionInstruments.length === 0) return;
      const selectedOptions = selectOptions(spotPrice);
      const nextOptions = new Map(
        selectedOptions.map((instrument) => [instrument.instrumentToken, instrument]),
      );
      if (
        nextOptions.size === subscribedOptions.size &&
        [...nextOptions.keys()].every((token) => subscribedOptions.has(token))
      ) {
        return;
      }

      const removed = [...subscribedOptions.keys()].filter((token) => !nextOptions.has(token));
      const added = [...nextOptions.keys()].filter((token) => !subscribedOptions.has(token));
      if (removed.length > 0) {
        socket.send(
          JSON.stringify({
            event: "unsubscribeScripsLite",
            inputtoken: removed.map((token) => `nse_fo|${token}`).join(","),
          }),
        );
      }
      if (added.length > 0) {
        const inputtoken = added.map((token) => `nse_fo|${token}`).join(",");
        socket.send(JSON.stringify({ event: "subscribeScripsLite", inputtoken }));
        socket.send(JSON.stringify({ event: "snapshotScripsLite", inputtoken }));
      }
      subscribedOptions = nextOptions;
    };
    const emitFrame = (frame: ArrayBuffer) => {
      const view = new DataView(frame);
      let offset = 0;
      while (offset + 2 <= view.byteLength) {
        const packetLength = view.getUint16(offset, true);
        if (packetLength < 9 || offset + packetLength > view.byteLength) break;

        const messageCode = view.getUint16(offset + 2, true);
        const exchangeId = view.getInt8(offset + 4);
        const level = view.getUint8(offset + 5);
        const asOf = new Date().toISOString();
        if (messageCode === 7207 && packetLength >= 87 && exchangeId === 1) {
          const price = view.getInt32(offset + 29, true) / indexDivider;
          if (Number.isFinite(price) && price > 0) {
            onIndexPrice({ price, asOf });
            updateOptionSubscriptions(price);
          }
        } else if (messageCode === 7208 && packetLength >= 54 && exchangeId === 2 && level === 1) {
          const token = view.getUint32(offset + 9, true);
          const instrument = optionInstrumentsByToken.get(token);
          const price = view.getUint32(offset + 21, true) / optionDivider;
          if (
            instrument &&
            subscribedOptions.has(instrument.instrumentToken) &&
            Number.isFinite(price) &&
            price > 0
          ) {
            onOptionPrice({ tradingSymbol: instrument.tradingSymbol, price, asOf });
          }
        }

        offset += packetLength;
      }
    };

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          user: session.user,
          auth: session.sid,
          format: "native_batch",
          source: "NEOTRADEAPI",
          sdk_version: 1.1,
          sdk_date: new Date().toISOString().slice(0, 10),
        }),
      );
    };

    socket.onmessage = (event) => {
      void (async () => {
        if (typeof event.data === "string") {
          let message: unknown;
          try {
            message = JSON.parse(event.data);
          } catch {
            reportError(new KotakNeoError("Kotak market-data feed sent an invalid message", 502));
            return;
          }
          if (!isRecord(message)) return;

          const messageCode = Number(message.message_code);
          if (messageCode === 1120) {
            reportError(new KotakNeoError("Kotak market-data feed authentication failed", 401));
            return;
          }
          if (messageCode === 1119 || messageCode === 1117) {
            const exchanges = isRecord(message.exchanges) ? message.exchanges : undefined;
            const nseCash = exchanges && isRecord(exchanges.nse_cm) ? exchanges.nse_cm : undefined;
            const nseFo = exchanges && isRecord(exchanges.nse_fo) ? exchanges.nse_fo : undefined;
            indexDivider = validDivider(nseCash?.divider, indexDivider);
            optionDivider = validDivider(nseFo?.divider, optionDivider);
            if (messageCode === 1117) {
              if (message.format !== "native_batch") {
                reportError(new KotakNeoError("Kotak market-data feed returned an unsupported format", 502));
                return;
              }
              const { niftyIndexSegment, niftyIndexToken } = this.config;
              if (!niftyIndexSegment || !niftyIndexToken) {
                reportError(new KotakNeoError("NIFTY index feed settings are not configured", 503));
                return;
              }
              authenticated = true;
              onConnected();
              const inputtoken = `${niftyIndexSegment}|${niftyIndexToken}`;
              socket.send(JSON.stringify({ event: "subscribeIndices", inputtoken }));
              socket.send(JSON.stringify({ event: "snapshotIndices", inputtoken }));
            }
            return;
          }
          if (messageCode === 1109 && Number(message.error_code) !== 0) {
            reportError(new KotakNeoError("Kotak rejected the market-data subscription", 502));
          }
          return;
        }

        if (!authenticated || stopped) return;
        if (event.data instanceof ArrayBuffer) {
          emitFrame(event.data);
          return;
        }
        emitFrame(await event.data.arrayBuffer());
      })().catch(() => {
        reportError(new KotakNeoError("Could not decode the Kotak NIFTY index feed", 502));
      });
    };

    socket.onerror = () => {
      reportError(new KotakNeoError("Kotak market-data WebSocket connection failed", 503));
    };
    socket.onclose = () => {
      reportError(new KotakNeoError("Kotak market-data WebSocket disconnected", 503));
    };

    return () => {
      if (stopped) return;
      stopped = true;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState < 2) socket.close();
    };
  }

  async getScripMaster(): Promise<unknown> {
    return this.requestJson(this.config.scripMasterPath, {
      method: "GET",
      headers: {
        Authorization: this.config.consumerKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  }

  async getNseFoScripMaster(): Promise<string> {
    const masterResponse = await this.getScripMaster();
    const fileUrl = nseFoFileUrl(masterResponse);

    let response: Response;
    try {
      response = await this.fetchImpl(fileUrl, {
        method: "GET",
        headers: { Accept: "text/csv" },
        redirect: "error",
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new KotakNeoError("Kotak Neo Scrip Master download timed out", 504);
      }
      throw new KotakNeoError("Unable to download Kotak Neo Scrip Master", 503);
    }

    if (!response.ok) {
      throw new KotakNeoError(
        `Kotak Neo rejected the Scrip Master download (HTTP ${response.status})`,
        response.status,
      );
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SCRIP_MASTER_BYTES) {
      throw new KotakNeoError("Kotak Neo Scrip Master file is too large", 502);
    }
    if (!response.body) {
      throw new KotakNeoError("Kotak Neo returned an empty Scrip Master file", 502);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SCRIP_MASTER_BYTES) {
        await reader.cancel();
        throw new KotakNeoError("Kotak Neo Scrip Master file is too large", 502);
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }

  async checkMargin(
    session: AuthenticatedSession,
    input: MarginCheckInput,
  ): Promise<unknown> {
    const body = new URLSearchParams({
      jData: JSON.stringify(input),
    });

    return this.requestJson(this.config.marginPath, {
      method: "POST",
      headers: {
        Auth: session.tradeToken,
        Sid: session.sid,
        "neo-fin-key": this.config.financialKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }, session.baseUrl);
  }

  async getQuotes(
    session: AuthenticatedSession,
    instruments: QuoteInstrument[],
    quoteType = "all",
  ): Promise<unknown> {
    if (instruments.length === 0 || instruments.length > 50) {
      throw new KotakNeoError("Quote requests must include between 1 and 50 instruments", 400);
    }

    const neoSymbols = instruments
      .map(({ exchangeSegment, instrumentToken }) => `${exchangeSegment}|${instrumentToken}`)
      .join(",");
    const path = this.config.quotesPath
      .replace("{neo_symbols}", encodeURIComponent(neoSymbols))
      .replace("{quote_type}", encodeURIComponent(quoteType));

    return this.requestJson(path, {
      method: "GET",
      headers: {
        Authorization: this.config.consumerKey,
        Auth: session.tradeToken,
        Sid: session.sid,
        "neo-fin-key": this.config.financialKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }, session.baseUrl);
  }

  async placeNiftyOptionOrder(
    session: AuthenticatedSession,
    input: PlaceNiftyOptionOrderInput,
  ): Promise<unknown> {
    if (!this.config.placeOrderPath || !this.config.orderSource) {
      throw new KotakNeoError(
        "Kotak Neo order API is not configured; set KOTAK_NEO_PLACE_ORDER_PATH and KOTAK_NEO_ORDER_SOURCE",
        503,
      );
    }
    const orderData: Record<string, string> = {
      am: input.amo,
      dq: input.disclosedQuantity,
      es: "nse_fo",
      mp: input.marketProtection,
      pc: input.product,
      pf: "N",
      pr: input.price,
      pt: input.orderType,
      qt: input.quantity,
      rt: input.validity,
      tp: input.triggerPrice,
      ts: input.tradingSymbol,
      tt: input.transactionType,
      os: this.config.orderSource,
    };
    if (input.tag) orderData.ig = input.tag;
    if (input.product === "BO") {
      if (
        !input.squareOffType ||
        !input.stopLossType ||
        !input.stopLossValue ||
        !input.squareOffValue ||
        !input.trailingStopLoss ||
        input.trailingSlValue === undefined
      ) {
        throw new KotakNeoError("Bracket orders require all bracket parameters", 400);
      }
      orderData.tk = input.instrumentToken;
      orderData.sot = input.squareOffType;
      orderData.slt = input.stopLossType;
      orderData.slv = input.stopLossValue;
      orderData.sov = input.squareOffValue;
      orderData.tlt = input.trailingStopLoss;
      orderData.tsv = input.trailingSlValue;
      if (input.lastTradedPrice) orderData.lat = input.lastTradedPrice;
    }
    const body = new URLSearchParams({ jData: JSON.stringify(orderData) });

    const baseUrl = session.baseUrl ?? this.config.apiBaseUrl;
    const path = new URL(this.config.placeOrderPath, ensureTrailingSlash(baseUrl));
    if (session.serverId) path.searchParams.set("sId", session.serverId);
    return this.requestJson(path.toString(), {
      method: "POST",
      headers: {
        Auth: session.tradeToken,
        Sid: session.sid,
        "neo-fin-key": this.config.financialKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }, baseUrl);
  }

  private async post(
    path: string,
    headers: Record<string, string>,
    body: Record<string, string>,
  ): Promise<KotakResponse> {
    const responseBody = await this.requestJson(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!isRecord(responseBody)) {
      throw new KotakNeoError("Kotak Neo returned an invalid response", 502);
    }

    const data = isRecord(responseBody.data) ? responseBody.data : undefined;
    return { ...responseBody, ...(data ? { data } : {}) };
  }

  private async requestJson(
    path: string,
    init: RequestInit,
    baseUrl = this.config.apiBaseUrl,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, ensureTrailingSlash(baseUrl)), {
        ...init,
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new KotakNeoError("Kotak Neo request timed out", 504);
      }
      throw new KotakNeoError("Unable to reach Kotak Neo", 503);
    }

    if (!response.ok) {
      const upstreamMessage = await readUpstreamErrorMessage(response);
      throw new KotakNeoError(
        `Kotak Neo rejected the API request (HTTP ${response.status})${upstreamMessage ? `: ${upstreamMessage}` : ""}`,
        response.status,
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new KotakNeoError("Kotak Neo returned an invalid response", 502);
      }
      throw error;
    }
    if (!isRecord(responseBody)) {
      throw new KotakNeoError("Kotak Neo returned an invalid response", 502);
    }

    return responseBody;
  }
}

async function readUpstreamErrorMessage(response: Response): Promise<string | undefined> {
  let body: string;
  try {
    body = (await response.text()).slice(0, 4096);
  } catch {
    return undefined;
  }
  if (!body) return undefined;

  try {
    const parsed: unknown = JSON.parse(body);
    const message = findErrorMessage(parsed);
    return message ? sanitizeUpstreamMessage(message) : undefined;
  } catch {
    return undefined;
  }
}

function findErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = findErrorMessage(item);
      if (message) return message;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  const messageKeys = [
    "message",
    "errMsg",
    "errorMessage",
    "error_message",
    "error_msg",
    "error_description",
    "description",
    "faultstring",
    "faultString",
    "detail",
    "reason",
    "error",
  ];
  for (const key of messageKeys) {
    const message = findErrorMessage(value[key]);
    if (message) return message;
  }

  for (const nestedValue of Object.values(value)) {
    if (!Array.isArray(nestedValue) && !isRecord(nestedValue)) continue;
    const message = findErrorMessage(nestedValue);
    if (message) return message;
  }
  return undefined;
}

function sanitizeUpstreamMessage(value: string): string | undefined {
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return sanitized ? sanitized.slice(0, 300) : undefined;
}

const MAX_SCRIP_MASTER_BYTES = 100 * 1024 * 1024;
const SCRIP_MASTER_HOST = "lapi.kotaksecurities.com";

function nseFoFileUrl(value: unknown): URL {
  if (!isRecord(value)) {
    throw new KotakNeoError("Kotak Neo returned invalid Scrip Master paths", 502);
  }
  const data = isRecord(value.data) ? value.data : value;
  const filesPaths = data.filesPaths;
  if (!Array.isArray(filesPaths)) {
    throw new KotakNeoError("Kotak Neo returned invalid Scrip Master paths", 502);
  }

  const path = filesPaths.find(isNseFoFilePath);
  if (!path) {
    throw new KotakNeoError("Kotak Neo did not provide the NSE F&O Scrip Master file", 502);
  }

  let url: URL;
  try {
    url = new URL(path);
  } catch {
    throw new KotakNeoError("Kotak Neo returned an invalid NSE F&O file URL", 502);
  }
  if (url.protocol !== "https:" || url.hostname !== SCRIP_MASTER_HOST) {
    throw new KotakNeoError("Kotak Neo returned an untrusted NSE F&O file URL", 502);
  }
  return url;
}

function isNseFoFilePath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return /\/nse_fo\.csv$/i.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toWebSocketUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Kotak market-data feed URL");
  }
  if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "wss:") {
    throw new Error("Kotak market-data feed URL must use HTTPS or WSS");
  }
  if (url.username || url.password) {
    throw new Error("Kotak market-data feed URL must not contain credentials");
  }
  return url.toString();
}

function requiredString(value: unknown): string {
  const result = optionalString(value);
  if (!result) {
    throw new KotakNeoError("Kotak Neo returned an incomplete authentication response", 502);
  }
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function brokerBaseUrl(value: unknown): string | undefined {
  const rawBaseUrl = optionalString(value);
  if (!rawBaseUrl) return undefined;

  let url: URL;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new KotakNeoError("Kotak Neo returned an invalid post-login baseUrl", 502);
  }
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "kotaksecurities.com" &&
      !url.hostname.endsWith(".kotaksecurities.com")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new KotakNeoError("Kotak Neo returned an untrusted post-login baseUrl", 502);
  }
  return ensureTrailingSlash(url.toString());
}

function redactKotakResponse(value: unknown, key = "", depth = 0): unknown {
  if (
    key &&
    /token|sid|server.?id|rid|auth|mpin|totp|mobile|phone|ucc|key|password|feed.?url/i.test(key)
  ) {
    return value === undefined || value === null ? value : "[REDACTED]";
  }
  if (depth >= 8) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactKotakResponse(item, "", depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([childKey, childValue]) => [
          childKey,
          redactKotakResponse(childValue, childKey, depth + 1),
        ]),
    );
  }
  if (typeof value === "string" && value.length > 1000) {
    return `${value.slice(0, 1000)}…[TRUNCATED]`;
  }
  return value;
}

function validDivider(value: unknown, fallback: number): number {
  const divider = Number(value);
  return Number.isFinite(divider) && divider > 0 ? divider : fallback;
}
