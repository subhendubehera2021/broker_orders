import { FYERS_HISTORICAL_RESOLUTIONS } from "../../fyers/constants/fyers-market-data.js";
import { recentIndiaDateRange } from "../lib/liquidity-swings.js";
import { isValidDateOnly } from "../../utils/date.js";

export function validateLiquiditySwingsQuery(request, response, next) {
  const query = request.query;
  const errors = {};

  if (typeof query.symbol !== "string" || query.symbol.trim() === "") {
    errors.symbol = "A Fyers symbol is required.";
  }

  let dateRange;
  if (query.fromDate === undefined && query.toDate === undefined) {
    dateRange = recentIndiaDateRange();
  } else if (query.fromDate === undefined || query.toDate === undefined) {
    errors.fromDate = "Provide both fromDate and toDate.";
  } else if (
    !isValidDateOnly(query.fromDate) ||
    !isValidDateOnly(query.toDate) ||
    query.toDate < query.fromDate
  ) {
    errors.fromDate = "Provide valid YYYY-MM-DD dates in ascending order.";
  } else {
    dateRange = { fromDate: query.fromDate, toDate: query.toDate };
  }

  const resolution = query.resolution ?? "1";
  if (
    typeof resolution !== "string" ||
    !FYERS_HISTORICAL_RESOLUTIONS.has(resolution)
  ) {
    errors.resolution = "Unsupported Fyers historical candle resolution.";
  }

  const pivotLookbackValue = query.pivotLookback ?? "5";
  const pivotLookback = Number(pivotLookbackValue);
  if (
    typeof pivotLookbackValue !== "string" ||
    !/^\d+$/.test(pivotLookbackValue) ||
    !Number.isSafeInteger(pivotLookback) ||
    pivotLookback < 1
  ) {
    errors.pivotLookback = "Use a positive integer.";
  }

  let contFlag;
  if (query.contFlag !== undefined) {
    if (typeof query.contFlag !== "string" || !["0", "1"].includes(query.contFlag)) {
      errors.contFlag = "Use 0 or 1.";
    } else {
      contFlag = query.contFlag;
    }
  }

  if (Object.keys(errors).length > 0) {
    return response.status(400).json({
      error: "Invalid liquidity-swing query.",
      details: errors,
    });
  }

  response.locals.liquiditySwingQuery = {
    symbol: query.symbol.trim(),
    ...dateRange,
    resolution,
    pivotLookback,
    ...(contFlag === undefined ? {} : { contFlag }),
  };
  next();
}
