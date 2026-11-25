import { getQuotes as fetchQuotes } from "../services/quotes.service.js";

export async function getQuotes(_request, response) {
  try {
    const data = await fetchQuotes(response.locals.quoteSymbols);
    response.json(data);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers quotes request failed.";

    response.status(statusCode).json({ error: message });
  }
}
