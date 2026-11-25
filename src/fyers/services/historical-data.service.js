import { getFyersClient } from "./fyers-client.js";

export function getHistoricalData(query) {
  return getFyersClient().getHistory(query);
}
