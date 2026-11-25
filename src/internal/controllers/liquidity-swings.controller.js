import { fetchLiquiditySwings } from "../lib/liquidity-swings.js";

export async function getLiquiditySwings(_request, response) {
  try {
    const { symbol, ...options } = response.locals.liquiditySwingQuery;
    const result = await fetchLiquiditySwings(symbol, options);
    response.json(result);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers liquidity-swing request failed.";

    response.status(statusCode).json({ error: message });
  }
}
