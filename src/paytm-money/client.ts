const LOGIN_URL = "https://login.paytmmoney.com/merchant-login";
const API_BASE_URL = "https://developer.paytmmoney.com/";
const ACCESS_TOKEN_PATH = "accounts/v2/gettoken";
const USER_DETAILS_PATH = "accounts/v1/user/details";
const REGULAR_ORDER_PATH = "orders/v1/place/regular";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface PaytmMoneyClientOptions {
  apiKey: string;
  apiSecretKey: string;
  requestTimeoutMs?: number;
}

export interface PaytmMoneyAccessTokens {
  merchant_id: string;
  channel_id: string;
  api_key: string;
  access_token: string;
  public_access_token: string;
  read_access_token: string;
}

export interface PaytmMoneyUserDetails {
  data: {
    kycName: string;
    userId: string | number;
    activeSegments: string[];
  };
  meta?: {
    requestId?: string | null;
    responseId?: string | null;
    code?: string;
    message?: string;
    displayMessage?: string;
  };
}

export interface PaytmMoneyRegularOrderInput {
  source?: "W" | "M" | "N" | "I" | "R" | "O";
  txn_type: "B" | "S";
  exchange: "NSE" | "BSE";
  segment: "E" | "D";
  product: "C" | "I" | "B" | "V" | "M";
  security_id: string;
  quantity: number;
  validity: "DAY" | "IOC" | "GTC" | "GTD";
  order_type: "LMT" | "SL" | "SLM";
  price: number;
  trigger_price?: number;
  off_mkt_flag?: boolean | "true" | "false";
  order_ltp?: number;
}

export interface PaytmMoneyRegularOrderResponse {
  status: string;
  message: string;
  data: Array<{ order_no: string }>;
  error_code?: string;
}

export class PaytmMoneyError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly upstreamCode?: string,
  ) {
    super(message);
    this.name = "PaytmMoneyError";
  }
}

export class PaytmMoneyClient {
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly options: PaytmMoneyClientOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!options.apiKey.trim()) {
      throw new Error("Paytm Money apiKey must be configured");
    }
    if (!options.apiSecretKey.trim()) {
      throw new Error("Paytm Money apiSecretKey must be configured");
    }

    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1) {
      throw new Error("Paytm Money requestTimeoutMs must be a positive integer");
    }
  }

  createLoginUrl(state: string): URL {
    if (!state.trim()) {
      throw new PaytmMoneyError("Paytm Money login state must not be empty", 400);
    }

    const url = new URL(LOGIN_URL);
    url.searchParams.set("apiKey", this.options.apiKey);
    url.searchParams.set("state", state);
    return url;
  }

  async generateAccessToken(requestToken: string): Promise<PaytmMoneyAccessTokens> {
    if (!requestToken.trim()) {
      throw new PaytmMoneyError("Paytm Money request token must not be empty", 400);
    }

    const response = await this.requestJson(ACCESS_TOKEN_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.options.apiKey,
        api_secret_key: this.options.apiSecretKey,
        request_token: requestToken,
      }),
    });

    if (!isRecord(response)) {
      throw new PaytmMoneyError("Paytm Money returned an invalid token response", 502);
    }
    throwIfRejected(response, "access-token request");

    return {
      merchant_id: requireString(response.merchant_id, "merchant_id"),
      channel_id: requireString(response.channel_id, "channel_id"),
      api_key: requireString(response.api_key, "api_key"),
      access_token: requireString(response.access_token, "access_token"),
      public_access_token: requireString(response.public_access_token, "public_access_token"),
      read_access_token: requireString(response.read_access_token, "read_access_token"),
    };
  }

  async getUserDetails(accessToken: string): Promise<PaytmMoneyUserDetails> {
    if (!accessToken.trim()) {
      throw new PaytmMoneyError("Paytm Money access token must not be empty", 400);
    }

    const response = await this.requestJson(USER_DETAILS_PATH, {
      method: "GET",
      headers: { "x-jwt-token": accessToken },
    });

    if (!isRecord(response)) {
      throw new PaytmMoneyError("Paytm Money returned an invalid user-details response", 502);
    }
    throwIfRejected(response, "user-details request");

    const data = isRecord(response.data) ? response.data : undefined;
    if (
      !data ||
      typeof data.kycName !== "string" ||
      (typeof data.userId !== "string" && typeof data.userId !== "number") ||
      !Array.isArray(data.activeSegments) ||
      !data.activeSegments.every((segment) => typeof segment === "string")
    ) {
      throw new PaytmMoneyError("Paytm Money returned incomplete user details", 502);
    }

    const meta = isRecord(response.meta) ? response.meta : undefined;
    return {
      data: {
        kycName: data.kycName,
        userId: data.userId,
        activeSegments: data.activeSegments,
      },
      ...(meta
        ? {
            meta: {
              requestId: optionalNullableString(meta.requestId),
              responseId: optionalNullableString(meta.responseId),
              code: optionalString(meta.code),
              message: optionalString(meta.message),
              displayMessage: optionalString(meta.displayMessage),
            },
          }
        : {}),
    };
  }

  async placeRegularOrder(
    accessToken: string,
    order: PaytmMoneyRegularOrderInput,
  ): Promise<PaytmMoneyRegularOrderResponse> {
    if (!accessToken.trim()) {
      throw new PaytmMoneyError("Paytm Money access token must not be empty", 400);
    }

    const response = await this.requestJson(REGULAR_ORDER_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-jwt-token": accessToken,
      },
      body: JSON.stringify(order),
    });

    if (!isRecord(response)) {
      throw new PaytmMoneyError("Paytm Money returned an invalid order response", 502);
    }
    throwIfRejected(response, "regular order");

    const status = requireString(response.status, "status");
    const message = requireString(response.message, "message");
    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new PaytmMoneyError("Paytm Money returned no regular order details", 502);
    }

    const data = response.data.map((item) => {
      if (!isRecord(item)) {
        throw new PaytmMoneyError("Paytm Money returned an invalid order number", 502);
      }
      const orderNumber = item.order_no;
      if (
        (typeof orderNumber !== "string" && typeof orderNumber !== "number") ||
        String(orderNumber).length === 0
      ) {
        throw new PaytmMoneyError("Paytm Money returned an invalid order number", 502);
      }
      return { order_no: String(orderNumber) };
    });

    const errorCode = optionalString(response.error_code);
    return {
      status,
      message,
      data,
      ...(errorCode ? { error_code: errorCode } : {}),
    };
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, API_BASE_URL), {
        ...init,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new PaytmMoneyError("Paytm Money request timed out", 504);
      }
      throw new PaytmMoneyError("Unable to reach Paytm Money", 503);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new PaytmMoneyError("Paytm Money returned an invalid JSON response", 502);
      }
      throw error;
    }

    if (!response.ok) {
      const code = isRecord(body) ? upstreamCode(body) : undefined;
      throw new PaytmMoneyError(
        `Paytm Money rejected the API request (HTTP ${response.status})`,
        response.status,
        code,
      );
    }
    return body;
  }
}

function throwIfRejected(response: Record<string, unknown>, operation: string): void {
  const rawStatus = response.resultStatus ?? response.status;
  const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : undefined;
  if (status === "failure") {
    const code = upstreamCode(response);
    throw new PaytmMoneyError(
      `Paytm Money rejected the ${operation}${code ? ` (code=${code})` : ""}`,
      400,
      code,
    );
  }
}

function upstreamCode(response: Record<string, unknown>): string | undefined {
  const code = response.resultCode ?? response.code ?? response.error_code;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new PaytmMoneyError(
      `Paytm Money returned an incomplete access-token response (${field})`,
      502,
    );
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
