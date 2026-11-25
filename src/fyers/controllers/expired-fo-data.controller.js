import { getExpiredFoData as fetchExpiredFoData } from "../services/expired-fo-data.service.js";
import {
  getExpiredContracts as fetchExpiredContracts,
  getExpiredExpiryDates as fetchExpiredExpiryDates,
} from "../services/expired-fo-data.service.js";

export async function getExpiredFoData(_request, response) {
  try {
    const data = await fetchExpiredFoData(response.locals.expiredFoDataQuery);
    response.json(data);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers expired F&O data request failed.";

    response.status(statusCode).json({ error: message });
  }
}

export async function getExpiredContracts(_request, response) {
  try {
    const data = await fetchExpiredContracts(response.locals.expiredContractsQuery);
    response.json(data);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers expired contracts request failed.";

    response.status(statusCode).json({ error: message });
  }
}

export async function getExpiredExpiryDates(_request, response) {
  try {
    const data = await fetchExpiredExpiryDates(response.locals.expiredExpiryDatesQuery);
    response.json(data);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers expired expiry-dates request failed.";

    response.status(statusCode).json({ error: message });
  }
}
