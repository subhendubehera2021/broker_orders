import { getAutoTradeProcessData } from "../services/auto-trade-process.service.js";

export async function getAutoTradeProcess(_request, response) {
  try {
    const result = await getAutoTradeProcessData(
      response.locals.optionChainQuery,
      response.locals.ltpRange,
      { swingConfigs: response.locals.liquiditySwingConfigs },
    );
    response.json(result);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Auto-trade-process data request failed.";

    response.status(statusCode).json({ error: message });
  }
}
