import { getFyersClient } from "./fyers-client.js";

export function getOptionChain(query) {
  return getFyersClient().getOptionChain(query);
}
