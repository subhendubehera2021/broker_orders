import { getFyersClient } from "./fyers-client.js";

export function getQuotes(symbols) {
  return getFyersClient().getQuotes(symbols);
}
