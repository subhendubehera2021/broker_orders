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
    readonly upstreamCode?: string,
    readonly upstreamHttpStatusCode?: number,
    readonly upstreamMessage?: string,
    readonly upstreamStat?: string,
  ) {
    super(message);
    this.name = "KotakNeoError";
  }
}

export class KotakNeoClient {
  constructor(
    private readonly config: KotakNeoConfig & { consumerKey: string },
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly webSocketFactory?: (url: string) => unknown,
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
    const response = await this.requestJson(path.toString(), {
      method: "POST",
      headers: {
        Auth: session.tradeToken,
        Sid: session.sid,
        "neo-fin-key": this.config.financialKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }, baseUrl);
    if (
      isRecord(response) &&
      typeof response.stat === "string" &&
      response.stat.toLowerCase() !== "ok"
    ) {
      const upstreamCode =
        typeof response.stCode === "string" || typeof response.stCode === "number"
          ? String(response.stCode)
          : undefined;
      const upstreamMessage = findErrorMessage(response);
      const sanitizedMessage = upstreamMessage
        ? sanitizeUpstreamMessage(upstreamMessage)
        : undefined;
      const statusCode = upstreamCode === "100008" ? 401 : 400;
      throw new KotakNeoError(
        `Kotak Neo rejected the order${upstreamCode ? ` (stCode=${upstreamCode})` : ""}${sanitizedMessage ? `: ${sanitizedMessage}` : ""}`,
        statusCode,
        upstreamCode,
        200,
        sanitizedMessage,
        response.stat,
      );
    }
    return response;
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
      const upstreamError = await readUpstreamError(response);
      throw new KotakNeoError(
        `Kotak Neo rejected the API request (HTTP ${response.status})${upstreamError.message ? `: ${upstreamError.message}` : ""}`,
        response.status,
        upstreamError.code,
        response.status,
        upstreamError.message,
        upstreamError.stat,
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

interface UpstreamErrorDetails {
  code?: string;
  message?: string;
  stat?: string;
}

async function readUpstreamError(response: Response): Promise<UpstreamErrorDetails> {
  let body: string;
  try {
    body = (await response.text()).slice(0, 4096);
  } catch {
    return {};
  }
  if (!body) return {};

  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) return {};
    const rawCode =
      typeof parsed.stCode === "string" || typeof parsed.stCode === "number"
        ? String(parsed.stCode)
        : undefined;
    const rawStat = typeof parsed.stat === "string" ? parsed.stat : undefined;
    const rawMessage = findErrorMessage(parsed);
    return {
      ...(rawCode ? { code: rawCode } : {}),
      ...(rawMessage && sanitizeUpstreamMessage(rawMessage)
        ? { message: sanitizeUpstreamMessage(rawMessage) }
        : {}),
      ...(rawStat ? { stat: sanitizeUpstreamMessage(rawStat) } : {}),
    };
  } catch {
    return {};
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
    "emsg",
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

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
