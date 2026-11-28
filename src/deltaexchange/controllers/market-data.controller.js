import {
  getBtcUsdPerpetualBreakoutsForRange,
  getRecentBtcUsdPerpetualCandles,
  SUPPORTED_BREAKOUT_RANGE_DAYS,
  SUPPORTED_CANDLE_RESOLUTIONS,
} from "../services/market-data.service.js";

function getRequestedRange(query) {
  const hasStart = query.start !== undefined;
  const hasEnd = query.end !== undefined;
  if (!hasStart && !hasEnd) {
    return null;
  }
  if (
    typeof query.start !== "string" ||
    typeof query.end !== "string" ||
    !/^\d+$/.test(query.start) ||
    !/^\d+$/.test(query.end)
  ) {
    const error = new Error("Both start and end must be Unix timestamps in seconds.");
    error.statusCode = 400;
    throw error;
  }
  return {
    start: Number(query.start),
    end: Number(query.end),
  };
}

function getRequestedBreakoutDays(query) {
  const allowedDays = SUPPORTED_BREAKOUT_RANGE_DAYS.join(", ");
  if (query.days === undefined) {
    return undefined;
  }
  if (typeof query.days !== "string" || !/^\d+$/.test(query.days)) {
    const error = new Error(`days must be one of ${allowedDays}.`);
    error.statusCode = 400;
    throw error;
  }
  const days = Number(query.days);
  if (!SUPPORTED_BREAKOUT_RANGE_DAYS.includes(days)) {
    const error = new Error(`days must be one of ${allowedDays}.`);
    error.statusCode = 400;
    throw error;
  }
  return days;
}

function getRequestedResolution(query) {
  const resolution = query.resolution ?? "1m";
  if (
    typeof resolution !== "string" ||
    !SUPPORTED_CANDLE_RESOLUTIONS.includes(resolution)
  ) {
    const error = new Error("resolution must be 1m, 3m, 5m, or 15m.");
    error.statusCode = 400;
    throw error;
  }
  return resolution;
}

export async function getCandles(request, response) {
  try {
    const range = getRequestedRange(request.query);
    const breakoutDays = getRequestedBreakoutDays(request.query);
    const resolution = getRequestedResolution(request.query);
    if (range && breakoutDays !== undefined) {
      const error = new Error("Use either a historical date range or a quick breakout range, not both.");
      error.statusCode = 400;
      throw error;
    }
    const result = range
      ? await getBtcUsdPerpetualBreakoutsForRange({ ...range, resolution })
      : await getRecentBtcUsdPerpetualCandles(
        { ...(breakoutDays === undefined ? {} : { breakoutDays }), resolution },
      );
    response.json(result);
  } catch (error) {
    response.status(error.statusCode ?? 502).json({ error: error.message });
  }
}
