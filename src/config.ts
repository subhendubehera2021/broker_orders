export interface KotakNeoConfig {
  apiBaseUrl: string;
  consumerKey?: string;
  mobileNumber?: string;
  ucc?: string;
  mpin?: string;
  financialKey: string;
  totpLoginPath: string;
  totpValidatePath: string;
  scripMasterPath: string;
  marginPath: string;
  quotesPath: string;
  niftyIndexToken?: string;
  niftyIndexSegment?: string;
  requestTimeoutMs: number;
}

export interface AppConfig {
  host: string;
  port: number;
  kotakNeo: KotakNeoConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = parseInteger(env.PORT, "PORT");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const requestTimeoutMs = parseInteger(
    env.KOTAK_NEO_REQUEST_TIMEOUT_MS,
    "KOTAK_NEO_REQUEST_TIMEOUT_MS",
  );
  if (requestTimeoutMs < 1) {
    throw new Error("KOTAK_NEO_REQUEST_TIMEOUT_MS must be greater than zero");
  }

  const apiBaseUrl = requiredValue(env.KOTAK_NEO_API_BASE_URL, "KOTAK_NEO_API_BASE_URL");
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error("KOTAK_NEO_API_BASE_URL must be a valid HTTPS URL");
  }
  if (
    parsedBaseUrl.protocol !== "https:" ||
    parsedBaseUrl.username ||
    parsedBaseUrl.password ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash
  ) {
    throw new Error("KOTAK_NEO_API_BASE_URL must be a valid HTTPS URL without credentials");
  }

  const totpLoginPath = requiredValue(env.KOTAK_NEO_TOTP_LOGIN_PATH, "KOTAK_NEO_TOTP_LOGIN_PATH");
  const totpValidatePath = requiredValue(
    env.KOTAK_NEO_TOTP_VALIDATE_PATH,
    "KOTAK_NEO_TOTP_VALIDATE_PATH",
  );
  const scripMasterPath = requiredValue(
    env.KOTAK_NEO_SCRIP_MASTER_PATH,
    "KOTAK_NEO_SCRIP_MASTER_PATH",
  );
  const marginPath = requiredValue(env.KOTAK_NEO_MARGIN_PATH, "KOTAK_NEO_MARGIN_PATH");
  const quotesPath = requiredValue(env.KOTAK_NEO_QUOTES_PATH, "KOTAK_NEO_QUOTES_PATH");
  validateRelativePath(totpLoginPath, "KOTAK_NEO_TOTP_LOGIN_PATH");
  validateRelativePath(totpValidatePath, "KOTAK_NEO_TOTP_VALIDATE_PATH");
  validateRelativePath(scripMasterPath, "KOTAK_NEO_SCRIP_MASTER_PATH");
  validateRelativePath(marginPath, "KOTAK_NEO_MARGIN_PATH");
  if (!quotesPath.includes("{neo_symbols}") || !quotesPath.includes("{quote_type}")) {
    throw new Error("KOTAK_NEO_QUOTES_PATH must contain {neo_symbols} and {quote_type}");
  }
  validateRelativePath(
    quotesPath.replaceAll("{neo_symbols}", "symbols").replaceAll("{quote_type}", "all"),
    "KOTAK_NEO_QUOTES_PATH",
  );

  return {
    host: requiredValue(env.HOST, "HOST"),
    port,
    kotakNeo: {
      apiBaseUrl,
      consumerKey: env.KOTAK_NEO_CONSUMER_KEY || undefined,
      mobileNumber: env.KOTAK_NEO_MOBILE_NUMBER || undefined,
      ucc: env.KOTAK_NEO_UCC || undefined,
      mpin: env.KOTAK_NEO_MPIN || undefined,
      financialKey: requiredValue(env.KOTAK_NEO_FIN_KEY, "KOTAK_NEO_FIN_KEY"),
      totpLoginPath,
      totpValidatePath,
      scripMasterPath,
      marginPath,
      quotesPath,
      niftyIndexToken: env.KOTAK_NEO_NIFTY_INDEX_TOKEN || undefined,
      niftyIndexSegment: env.KOTAK_NEO_NIFTY_INDEX_SEGMENT || undefined,
      requestTimeoutMs,
    },
  };
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} must be configured`);
  }
  return value.trim();
}

function parseInteger(value: string | undefined, name: string): number {
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be configured as an integer`);
  }
  return Number(value);
}

function validateRelativePath(value: string, name: string): void {
  if (value.startsWith("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${name} must be a relative path without query or fragment`);
  }
  const resolved = new URL(value, "https://config-validation.invalid/");
  if (resolved.origin !== "https://config-validation.invalid") {
    throw new Error(`${name} must be a relative path`);
  }
}
