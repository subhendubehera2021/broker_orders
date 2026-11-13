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
  orderBookPath?: string;
  cancelOrderPath?: string;
  modifyOrderPath?: string;
  positionsPath?: string;
  placeOrderPath?: string;
  orderSource?: string;
  quotesPath: string;
  niftyIndexToken?: string;
  niftyIndexSegment?: string;
  logKotakLoginResponses?: boolean;
  requestTimeoutMs: number;
}

export interface AppConfig {
  host: string;
  port: number;
  webAccessPasscode: string;
  openOrderPriceStep: number;
  autoSellStopLossRupees: number;
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
  const webAccessPasscode = requiredValue(env.WEB_ACCESS_PASSCODE, "WEB_ACCESS_PASSCODE");
  if (!/^[A-Z0-9]{1,32}$/.test(webAccessPasscode)) {
    throw new Error("WEB_ACCESS_PASSCODE must be 1-32 uppercase letters or digits");
  }
  const openOrderPriceStep = parsePriceStep(env.OPEN_ORDER_PRICE_STEP);
  const autoSellStopLossRupees = parsePositiveRupees(
    env.AUTO_SELL_STOP_LOSS_RUPEES,
    "AUTO_SELL_STOP_LOSS_RUPEES",
    5,
  );

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
  const orderBookPath = env.KOTAK_NEO_ORDER_BOOK_PATH?.trim() || undefined;
  const cancelOrderPath = env.KOTAK_NEO_CANCEL_ORDER_PATH?.trim() || undefined;
  const modifyOrderPath = env.KOTAK_NEO_MODIFY_ORDER_PATH?.trim() || undefined;
  const positionsPath = env.KOTAK_NEO_POSITIONS_PATH?.trim() || undefined;
  const placeOrderPath = env.KOTAK_NEO_PLACE_ORDER_PATH?.trim() || undefined;
  const orderSource = env.KOTAK_NEO_ORDER_SOURCE?.trim() || undefined;
  const quotesPath = requiredValue(env.KOTAK_NEO_QUOTES_PATH, "KOTAK_NEO_QUOTES_PATH");
  validateRelativePath(totpLoginPath, "KOTAK_NEO_TOTP_LOGIN_PATH");
  validateRelativePath(totpValidatePath, "KOTAK_NEO_TOTP_VALIDATE_PATH");
  validateRelativePath(scripMasterPath, "KOTAK_NEO_SCRIP_MASTER_PATH");
  validateRelativePath(marginPath, "KOTAK_NEO_MARGIN_PATH");
  if (orderBookPath) validateRelativePath(orderBookPath, "KOTAK_NEO_ORDER_BOOK_PATH");
  if (cancelOrderPath) validateRelativePath(cancelOrderPath, "KOTAK_NEO_CANCEL_ORDER_PATH");
  if (modifyOrderPath) validateRelativePath(modifyOrderPath, "KOTAK_NEO_MODIFY_ORDER_PATH");
  if (positionsPath) validateRelativePath(positionsPath, "KOTAK_NEO_POSITIONS_PATH");
  if (placeOrderPath) validateRelativePath(placeOrderPath, "KOTAK_NEO_PLACE_ORDER_PATH");
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
    webAccessPasscode,
    openOrderPriceStep,
    autoSellStopLossRupees,
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
      ...(orderBookPath ? { orderBookPath } : {}),
      ...(cancelOrderPath ? { cancelOrderPath } : {}),
      ...(modifyOrderPath ? { modifyOrderPath } : {}),
      ...(positionsPath ? { positionsPath } : {}),
      ...(placeOrderPath ? { placeOrderPath } : {}),
      ...(orderSource ? { orderSource } : {}),
      quotesPath,
      niftyIndexToken: env.KOTAK_NEO_NIFTY_INDEX_TOKEN || undefined,
      niftyIndexSegment: env.KOTAK_NEO_NIFTY_INDEX_SEGMENT || undefined,
      logKotakLoginResponses: parseBoolean(
        env.KOTAK_NEO_LOG_LOGIN_RESPONSES,
        "KOTAK_NEO_LOG_LOGIN_RESPONSES",
        false,
      ),
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

function parsePriceStep(value: string | undefined): number {
  const normalized = value?.trim() || "1";
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("OPEN_ORDER_PRICE_STEP must be a positive multiple of ₹0.05");
  }
  const stepPaise = Number(normalized) * 100;
  if (!Number.isSafeInteger(stepPaise) || stepPaise <= 0 || stepPaise % 5 !== 0) {
    throw new Error("OPEN_ORDER_PRICE_STEP must be a positive multiple of ₹0.05");
  }
  return stepPaise / 100;
}

function parsePositiveRupees(value: string | undefined, name: string, fallback: number): number {
  const normalized = value?.trim() || String(fallback);
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${name} must be a positive rupee amount with up to two decimal places`);
  }
  const paise = Number(normalized) * 100;
  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new Error(`${name} must be a positive rupee amount with up to two decimal places`);
  }
  return paise / 100;
}

function parseBoolean(value: string | undefined, name: string, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (/^(true|1|yes)$/i.test(value.trim())) return true;
  if (/^(false|0|no)$/i.test(value.trim())) return false;
  throw new Error(`${name} must be true or false`);
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
