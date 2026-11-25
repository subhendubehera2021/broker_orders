import { getOptionChain as fetchOptionChain } from "../services/option-chain.service.js";
import { parseOptionChainModel } from "../models/option-chain.model.js";

export async function getOptionChain(_request, response) {
  try {
    const result = await fetchOptionChain(response.locals.optionChainQuery);

    if (!result?.data) {
      return response.status(502).json({
        error: result?.message || "Fyers option-chain request failed.",
        providerCode: result?.code,
      });
    }

    response.json(parseOptionChainModel(result.data));
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers option-chain request failed.";

    response.status(statusCode).json({ error: message });
  }
}
