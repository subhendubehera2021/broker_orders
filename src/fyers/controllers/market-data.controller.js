import { getHistoricalData as fetchHistoricalData } from "../services/historical-data.service.js";

export async function getHistoricalData(_request, response) {
  try {
    const data = await fetchHistoricalData(response.locals.historicalDataQuery);
    response.json(data);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers historical-data request failed";

    response.status(statusCode).json({ error: message });
  }
}
