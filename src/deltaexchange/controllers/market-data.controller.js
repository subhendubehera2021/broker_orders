import {
  getBtcUsdPerpetualBreakoutsForRange,
  getRecentBtcUsdPerpetualCandles,
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
  if (query.days === undefined) {
    return undefined;
  }
  if (typeof query.days !== "string" || !/^\d+$/.test(query.days)) {
    const error = new Error("days must be one of 3, 7, 15, or 30.");
    error.statusCode = 400;
    throw error;
  }
  const days = Number(query.days);
  if (![3, 7, 15, 30].includes(days)) {
    const error = new Error("days must be one of 3, 7, 15, or 30.");
    error.statusCode = 400;
    throw error;
  }
  return days;
}

export async function getCandles(request, response) {
  try {
    const range = getRequestedRange(request.query);
    const breakoutDays = getRequestedBreakoutDays(request.query);
    if (range && breakoutDays !== undefined) {
      const error = new Error("Use either a historical date range or a quick breakout range, not both.");
      error.statusCode = 400;
      throw error;
    }
    const result = range
      ? await getBtcUsdPerpetualBreakoutsForRange(range)
      : await getRecentBtcUsdPerpetualCandles(
        breakoutDays === undefined ? {} : { breakoutDays },
      );
    response.json(result);
  } catch (error) {
    response.status(error.statusCode ?? 502).json({ error: error.message });
  }
}
