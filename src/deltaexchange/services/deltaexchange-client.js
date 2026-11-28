import { createHmac } from "node:crypto";
import { DELTA_EXCHANGE_API_BASE_URL } from "../constants.js";

const AUTHENTICATION_PATH = "/v2/profile";
const USER_AGENT = "broker-orders/1.0";

function getCredentials(env = process.env) {
  const apiKey = env.DELTA_EXCHANGE_API_KEY?.trim();
  const apiSecret = env.DELTA_EXCHANGE_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    const error = new Error(
      "Set DELTA_EXCHANGE_API_KEY and DELTA_EXCHANGE_API_SECRET in .env.",
    );
    error.statusCode = 503;
    throw error;
  }

  return { apiKey, apiSecret };
}

export function getDeltaExchangeAuthStatus(env = process.env) {
  const { DELTA_EXCHANGE_API_KEY: apiKey, DELTA_EXCHANGE_API_SECRET: apiSecret } = env;
  return {
    configured: Boolean(apiKey?.trim() && apiSecret?.trim()),
    environment: "production",
  };
}

export function createDeltaExchangeSignature(
  apiSecret,
  method,
  timestamp,
  path,
  queryString = "",
  body = "",
) {
  const message = `${method.toUpperCase()}${timestamp}${path}${queryString}${body}`;
  return createHmac("sha256", apiSecret).update(message).digest("hex");
}

export async function testDeltaExchangeAuthentication({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const { apiKey, apiSecret } = getCredentials(env);
  const method = "GET";
  const timestamp = String(Math.floor(now / 1000));
  const signature = createDeltaExchangeSignature(
    apiSecret,
    method,
    timestamp,
    AUTHENTICATION_PATH,
  );
  const response = await fetchImpl(`${DELTA_EXCHANGE_API_BASE_URL}${AUTHENTICATION_PATH}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "api-key": apiKey,
      signature,
      timestamp,
    },
    signal: AbortSignal.timeout(10_000),
  });

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    const error = new Error("Delta Exchange returned an invalid response.", { cause });
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok || payload?.success !== true) {
    const code = typeof payload?.error?.code === "string"
      ? payload.error.code
      : `HTTP ${response.status}`;
    const error = new Error(`Delta Exchange authentication failed: ${code}.`);
    error.statusCode = 502;
    throw error;
  }

  return { authenticated: true };
}
