import { FYERS_HISTORICAL_RESOLUTIONS } from "../../fyers/constants/fyers-market-data.js";

export function validateLiquiditySwingOptions(request, response, next) {
  const errors = {};
  const resolution = request.query.resolution ?? "1";
  if (
    typeof resolution !== "string" ||
    !FYERS_HISTORICAL_RESOLUTIONS.has(resolution)
  ) {
    errors.resolution = "Use a resolution supported by Fyers historical data.";
  }

  const pivotLookbackValue = request.query.pivotLookback ?? "5";
  const pivotLookback = Number(pivotLookbackValue);
  if (
    typeof pivotLookbackValue !== "string" ||
    !/^\d+$/.test(pivotLookbackValue) ||
    !Number.isSafeInteger(pivotLookback) ||
    pivotLookback < 1
  ) {
    errors.pivotLookback = "Use a positive integer.";
  }

  if (Object.keys(errors).length > 0) {
    return response.status(400).json({
      error: "Invalid liquidity-swing options.",
      details: errors,
    });
  }

  response.locals.liquiditySwingConfigs = [{ resolution, pivotLookback }];
  next();
}
