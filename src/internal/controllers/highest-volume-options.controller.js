import { getHighestVolumeOptions as fetchHighestVolumeOptions } from "../services/highest-volume-options.service.js";

export async function getHighestVolumeOptions(_request, response) {
  try {
    const result = await fetchHighestVolumeOptions(
      response.locals.optionChainQuery,
      response.locals.ltpRange,
    );
    response.json(result);
  } catch (error) {
    const statusCode = error.statusCode === 503 ? 503 : 502;
    const message = statusCode === 503
      ? error.message
      : "Fyers option-chain analysis failed.";

    response.status(statusCode).json({ error: message });
  }
}
