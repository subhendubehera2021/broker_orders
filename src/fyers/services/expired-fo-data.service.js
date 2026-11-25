import { getFyersClient } from "./fyers-client.js";

export function getExpiredFoData(query) {
  return getFyersClient().get_fno_historical_data(query);
}

export function getExpiredContracts(query) {
  return getFyersClient().get_history_underlying_symbols(query);
}

export function getExpiredExpiryDates(query) {
  return getFyersClient().get_expiry_dates(query);
}
