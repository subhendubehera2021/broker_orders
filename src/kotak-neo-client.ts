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
  rid?: string;
  serverId?: string;
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

interface KotakResponse {
  data?: {
    token?: unknown;
    sid?: unknown;
    rid?: unknown;
    hsServerId?: unknown;
  };
}

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
    const tradeToken = requiredString(tradeResponse.data?.token);
    const sid = optionalString(tradeResponse.data?.sid) ?? viewSid;

    return {
      sid,
      tradeToken,
      rid: optionalString(tradeResponse.data?.rid),
      serverId: optionalString(tradeResponse.data?.hsServerId),
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
    });
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
    return {
      data: data
        ? {
            token: data.token,
            sid: data.sid,
            rid: data.rid,
            hsServerId: data.hsServerId,
          }
        : undefined,
    };
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, ensureTrailingSlash(this.config.apiBaseUrl)), {
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
      throw new KotakNeoError("Kotak Neo rejected the API request", response.status);
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
