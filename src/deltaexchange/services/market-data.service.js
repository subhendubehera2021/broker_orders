import { DELTA_EXCHANGE_API_BASE_URL } from "../constants.js";
import { analyzeLiquidityBreakouts } from "../lib/liquidity-breakouts.js";
import { findLiquiditySwings } from "../lib/liquidity-swings.js";

const CANDLES_PATH = "/v2/history/candles";
const CANDLE_RANGE_SECONDS = 24 * 60 * 60;
const DEFAULT_BREAKOUT_RANGE_DAYS = 3;
export const SUPPORTED_BREAKOUT_RANGE_DAYS = Object.freeze([
  3,
  7,
  15,
  30,
  60,
  90,
  120,
  180,
]);
const SWING_PIVOT_LOOKBACK = 5;
const MAX_CANDLES_PER_REQUEST = 2000;
const MAX_CONCURRENT_CANDLE_REQUESTS = 5;
const MAX_BACKTEST_RANGE_SECONDS = 31 * CANDLE_RANGE_SECONDS;
export const SUPPORTED_CANDLE_RESOLUTIONS = Object.freeze(["1m", "3m", "5m", "15m"]);

function getCandleIntervalSeconds(resolution) {
  if (!SUPPORTED_CANDLE_RESOLUTIONS.includes(resolution)) {
    const error = new Error("Candle resolution must be 1m, 3m, 5m, or 15m.");
    error.statusCode = 400;
    throw error;
  }
  return Number.parseInt(resolution, 10) * 60;
}

function getSwingContextSeconds(resolution) {
  return SWING_PIVOT_LOOKBACK * getCandleIntervalSeconds(resolution);
}

function isValidCandle(candle) {
  const time = Number(candle?.time);
  return Boolean(candle) &&
    Number.isSafeInteger(time) &&
    Number.isFinite(new Date(time * 1000).getTime()) &&
    ["open", "high", "low", "close", "volume"].every((key) =>
      candle[key] != null && Number.isFinite(Number(candle[key])));
}

function toSwingBar(candle) {
  return {
    timestamp: new Date(Number(candle.time) * 1000).toISOString(),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume),
  };
}

function toBreakoutCandle(candle) {
  return {
    time: Number(candle.time),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume),
  };
}

async function fetchCandleRange(start, end, resolution, fetchImpl) {
  const url = new URL(CANDLES_PATH, DELTA_EXCHANGE_API_BASE_URL);
  url.search = new URLSearchParams({
    resolution,
    symbol: "BTCUSD",
    start: String(start),
    end: String(end),
  }).toString();

  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    const error = new Error("Delta Exchange returned an invalid candle response.", { cause });
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok || payload?.success !== true || !Array.isArray(payload.result)) {
    const code = typeof payload?.error?.code === "string"
      ? payload.error.code
      : `HTTP ${response.status}`;
    const error = new Error(`Delta Exchange candle request failed: ${code}.`);
    error.statusCode = 502;
    throw error;
  }

  if (
    payload.result.length > MAX_CANDLES_PER_REQUEST ||
    payload.result.some((candle) => !isValidCandle(candle))
  ) {
    const error = new Error("Delta Exchange returned invalid candle data.");
    error.statusCode = 502;
    throw error;
  }

  return payload.result.filter(
    (candle) => Number(candle.time) >= start && Number(candle.time) <= end,
  );
}

async function fetchCandleWindow(start, end, resolution, fetchImpl) {
  const requestSpanSeconds = (MAX_CANDLES_PER_REQUEST - 1) *
    getCandleIntervalSeconds(resolution);
  const ranges = [];
  for (
    let rangeStart = start;
    rangeStart < end;
    rangeStart += requestSpanSeconds
  ) {
    ranges.push({
      start: rangeStart,
      end: Math.min(rangeStart + requestSpanSeconds, end),
    });
  }

  const batches = [];
  for (let offset = 0; offset < ranges.length; offset += MAX_CONCURRENT_CANDLE_REQUESTS) {
    const requestGroup = ranges.slice(offset, offset + MAX_CONCURRENT_CANDLE_REQUESTS);
    batches.push(...await Promise.all(
      requestGroup.map(({ start: rangeStart, end: rangeEnd }) =>
        fetchCandleRange(rangeStart, rangeEnd, resolution, fetchImpl)),
    ));
  }
  const candlesByTime = new Map();
  for (const batch of batches) {
    for (const candle of batch) {
      candlesByTime.set(Number(candle.time), candle);
    }
  }
  const candles = [...candlesByTime.values()]
    .sort((left, right) => Number(left.time) - Number(right.time));
  if (candles.length > MAX_CANDLES_PER_REQUEST * ranges.length) {
    const error = new Error("Delta Exchange returned invalid candle data.");
    error.statusCode = 502;
    throw error;
  }
  return candles;
}

export async function getRecentBtcUsdPerpetualCandles({
  fetchImpl = fetch,
  now = Date.now(),
  breakoutDays = DEFAULT_BREAKOUT_RANGE_DAYS,
  resolution = "1m",
} = {}) {
  const swingContextSeconds = getSwingContextSeconds(resolution);
  if (!SUPPORTED_BREAKOUT_RANGE_DAYS.includes(breakoutDays)) {
    const error = new Error(
      `Breakout range must be one of ${SUPPORTED_BREAKOUT_RANGE_DAYS.join(", ")} days.`,
    );
    error.statusCode = 400;
    throw error;
  }

  const end = Math.floor(now / 1000);
  const recentStart = end - CANDLE_RANGE_SECONDS;
  const breakoutStart = end - breakoutDays * CANDLE_RANGE_SECONDS;
  const requestStart = breakoutStart - swingContextSeconds;
  const analysisCandles = await fetchCandleWindow(requestStart, end, resolution, fetchImpl);

  const candles = analysisCandles.filter(
    (candle) => Number(candle.time) >= recentStart && Number(candle.time) <= end,
  );
  const recentAnalysisCandles = analysisCandles.filter(
    (candle) => Number(candle.time) >= recentStart - swingContextSeconds,
  );
  const isInWindow = (start) => (swing) => {
    const time = Date.parse(swing.pivotTime) / 1000;
    return time >= start && time <= end;
  };
  const recentSwings = findLiquiditySwings(
    recentAnalysisCandles.map(toSwingBar),
    { pivotLookback: SWING_PIVOT_LOOKBACK },
  );
  const liquiditySwings = {
    highs: recentSwings.highs.filter(isInWindow(recentStart)),
    lows: recentSwings.lows.filter(isInWindow(recentStart)),
  };
  const liquidityBreakouts = analyzeLiquidityBreakouts(
    recentAnalysisCandles.map(toBreakoutCandle),
    liquiditySwings,
  );

  const breakoutSwings = findLiquiditySwings(
    analysisCandles.map(toSwingBar),
    { pivotLookback: SWING_PIVOT_LOOKBACK },
  );
  const dailySwings = {
    highs: breakoutSwings.highs.filter(isInWindow(breakoutStart)),
    lows: breakoutSwings.lows.filter(isInWindow(breakoutStart)),
  };
  const dailyLiquidityBreakouts = analyzeLiquidityBreakouts(
    analysisCandles.map(toBreakoutCandle),
    dailySwings,
  ).filter((event) => event.breakoutTime >= breakoutStart && event.breakoutTime <= end);

  return {
    symbol: "BTCUSD.P",
    apiSymbol: "BTCUSD",
    resolution,
    pivotLookback: SWING_PIVOT_LOOKBACK,
    start: recentStart,
    breakoutStart,
    end,
    candles,
    liquiditySwings,
    liquidityBreakouts,
    dailyLiquidityBreakouts,
  };
}

export async function getBtcUsdPerpetualBreakoutsForRange({
  start,
  end,
  fetchImpl = fetch,
  now = Date.now(),
  resolution = "1m",
} = {}) {
  const swingContextSeconds = getSwingContextSeconds(resolution);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end - start > MAX_BACKTEST_RANGE_SECONDS
  ) {
    const error = new Error("The requested backtest date range is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const rangeEnd = Math.min(end, Math.floor(now / 1000));
  if (rangeEnd <= start) {
    const error = new Error("The selected backtest date is in the future.");
    error.statusCode = 400;
    throw error;
  }

  const contextStart = start - CANDLE_RANGE_SECONDS;
  const analysisStart = contextStart - swingContextSeconds;
  const analysisEnd = rangeEnd + swingContextSeconds;
  const analysisCandles = await fetchCandleWindow(
    analysisStart,
    analysisEnd,
    resolution,
    fetchImpl,
  );
  const backtestCandles = analysisCandles.filter(
    (candle) => Number(candle.time) >= start && Number(candle.time) < rangeEnd,
  );
  const allSwings = findLiquiditySwings(
    analysisCandles.map(toSwingBar),
    { pivotLookback: SWING_PIVOT_LOOKBACK },
  );
  const isRelevantSwing = (swing) => {
    const pivotTime = Date.parse(swing.pivotTime) / 1000;
    const brokenAt = swing.status === "broken"
      ? Date.parse(swing.brokenAt) / 1000
      : null;
    return pivotTime >= contextStart &&
      pivotTime < rangeEnd &&
      (brokenAt === null || brokenAt < rangeEnd);
  };
  const liquiditySwings = {
    highs: allSwings.highs.filter(isRelevantSwing),
    lows: allSwings.lows.filter(isRelevantSwing),
  };
  const liquidityBreakouts = analyzeLiquidityBreakouts(
    backtestCandles.map(toBreakoutCandle),
    liquiditySwings,
  ).filter((event) => event.breakoutTime >= start && event.breakoutTime < rangeEnd);

  return {
    symbol: "BTCUSD.P",
    apiSymbol: "BTCUSD",
    resolution,
    pivotLookback: SWING_PIVOT_LOOKBACK,
    start,
    breakoutStart: start,
    end: rangeEnd,
    candles: backtestCandles,
    liquiditySwings,
    liquidityBreakouts,
    dailyLiquidityBreakouts: liquidityBreakouts,
  };
}
