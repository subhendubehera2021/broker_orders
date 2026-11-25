import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fyersModel: FyersAPI } = require("fyers-api-v3");

let client;
let configuredAppId;
let configuredAccessToken;

export function getFyersClient() {
  const appId = process.env.FYERS_APP_ID?.trim();
  const accessToken = process.env.FYERS_ACCESS_TOKEN?.trim();

  if (!appId || !accessToken) {
    const error = new Error("Set FYERS_APP_ID and FYERS_ACCESS_TOKEN in .env.");
    error.statusCode = 503;
    throw error;
  }

  if (client && appId === configuredAppId && accessToken === configuredAccessToken) {
    return client;
  }

  client = new FyersAPI({ enableLogging: false });
  client.setAppId(appId);
  client.setAccessToken(accessToken);
  configuredAppId = appId;
  configuredAccessToken = accessToken;

  return client;
}
