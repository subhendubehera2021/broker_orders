/*
 * Adapted from the existing app's liquidity-swing analyzer, which is based on
 * Liquidity Swings [LuxAlgo], © LuxAlgo, CC BY-NC-SA 4.0:
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This Fyers adaptation is subject to the same attribution, share-alike, and
 * noncommercial requirements.
 */
import { FYERS_HISTORICAL_RESOLUTIONS } from "../../fyers/constants/fyers-market-data.js";
import { getHistoricalData } from "../../fyers/services/historical-data.service.js";
import { isValidDateOnly } from "../../utils/date.js";

const DEFAULT_OPTIONS = {
  resolution: "1",
  pivotLookback: 5,
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOhlcv(bar, index) {
  if (
    ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    throw new Error(`Fyers returned invalid OHLCV values at candle row ${index}`);
  }
  if (
    bar.low > bar.high ||
    bar.low > Math.min(bar.open, bar.close) ||
    bar.high < Math.max(bar.open, bar.close) ||
    bar.volume < 0
  ) {
    throw new Error(`Fyers returned invalid OHLCV values at candle row ${index}`);
  }
}

function validateBar(bar, index) {
  if (
    !isRecord(bar) ||
    typeof bar.timestamp !== "string" ||
    !Number.isFinite(Date.parse(bar.timestamp))
  ) {
    throw new Error(`Fyers returned an invalid historical candle at row ${index}`);
  }
  validateOhlcv(bar, index);
  return bar;
}

function parseCandle(row, index) {
  if (
    !Array.isArray(row) ||
    row.length < 6 ||
    typeof row[0] !== "number" ||
    !Number.isSafeInteger(row[0]) ||
    !Number.isFinite(new Date(row[0] * 1000).getTime())
  ) {
    throw new Error(`Fyers returned an invalid historical candle at row ${index}`);
  }

  const [epoch, open, high, low, close, volume] = row;
  const bar = {
    timestamp: new Date(epoch * 1000).toISOString(),
    open,
    high,
    low,
    close,
    volume,
  };
  validateOhlcv(bar, index);
  return bar;
}

function isPivotHigh(bars, index, lookback) {
  const pivot = bars[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    const older = bars[index - distance];
    const newer = bars[index + distance];
    if (pivot.high < older.high || pivot.high <= newer.high) {
      return false;
    }
  }
  return true;
}

function intersects(bar, top, bottom) {
  return bar.low < top && bar.high > bottom;
}

function makeSwingHigh(bars, pivotIndex, lookback) {
  const pivot = bars[pivotIndex];
  const zoneTop = pivot.high;
  const zoneBottom = Math.max(pivot.open, pivot.close);
  const confirmedAt = pivotIndex + lookback;
  let intersectionCount = 0;
  let intersectionVolume = 0;
  let brokenAt;

  for (let index = confirmedAt + 1; index < bars.length; index += 1) {
    const bar = bars[index];
    if (intersects(bar, zoneTop, zoneBottom)) {
      intersectionCount += 1;
      intersectionVolume += bar.volume;
    }
    if (brokenAt === undefined && bar.close > zoneTop) {
      brokenAt = bar.timestamp;
    }
  }

  return {
    side: "high",
    pivotTime: pivot.timestamp,
    confirmedAt: bars[confirmedAt].timestamp,
    level: pivot.high,
    zoneTop,
    zoneBottom,
    intersectionCount,
    intersectionVolume,
    status: brokenAt ? "broken" : intersectionCount > 0 ? "qualified" : "tracking",
    ...(brokenAt ? { brokenAt } : {}),
  };
}

export function findLatestLiquiditySwingHigh(inputBars, options = {}) {
  const { pivotLookback } = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isInteger(pivotLookback) || pivotLookback < 1) {
    throw new RangeError("pivotLookback must be a positive integer");
  }
  if (!Array.isArray(inputBars)) {
    throw new TypeError("Historical candles must be an array");
  }

  const bars = inputBars
    .map(validateBar)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  let latest;

  for (
    let pivotIndex = pivotLookback;
    pivotIndex + pivotLookback < bars.length;
    pivotIndex += 1
  ) {
    if (isPivotHigh(bars, pivotIndex, pivotLookback)) {
      latest = makeSwingHigh(bars, pivotIndex, pivotLookback);
    }
  }

  return latest;
}

export async function fetchLiquiditySwings(
  symbol,
  {
    fromDate,
    toDate,
    resolution = DEFAULT_OPTIONS.resolution,
    pivotLookback = DEFAULT_OPTIONS.pivotLookback,
    contFlag,
  } = {},
  getHistoryImpl = getHistoricalData,
) {
  if (typeof symbol !== "string" || symbol.trim() === "") {
    throw new Error("A valid Fyers symbol is required for swing analysis");
  }
  if (!isValidDateOnly(fromDate) || !isValidDateOnly(toDate) || toDate < fromDate) {
    throw new Error("Historical candle dates must be valid YYYY-MM-DD dates in ascending order");
  }
  if (!FYERS_HISTORICAL_RESOLUTIONS.has(resolution)) {
    throw new RangeError("Unsupported Fyers historical candle resolution");
  }
  if (!Number.isInteger(pivotLookback) || pivotLookback < 1) {
    throw new RangeError("pivotLookback must be a positive integer");
  }
  if (contFlag !== undefined && !["0", "1"].includes(String(contFlag))) {
    throw new RangeError("contFlag must be 0 or 1");
  }
  if (typeof getHistoryImpl !== "function") {
    throw new TypeError("getHistoryImpl must be a function");
  }

  const payload = await getHistoryImpl({
    symbol: symbol.trim(),
    resolution,
    date_format: "1",
    range_from: fromDate,
    range_to: toDate,
    ...(contFlag === undefined ? {} : { cont_flag: String(contFlag) }),
  });

  if (
    !isRecord(payload) ||
    typeof payload.s !== "string" ||
    payload.s.toLowerCase() !== "ok" ||
    !Array.isArray(payload.candles)
  ) {
    throw new Error("Fyers returned invalid historical candle data");
  }

  const bars = payload.candles.map(parseCandle);
  return {
    bars,
    swing: findLatestLiquiditySwingHigh(bars, { pivotLookback }) ?? null,
    resolution,
    pivotLookback,
  };
}

export function recentIndiaDateRange(now = new Date(), daysBack = 3) {
  if (!Number.isInteger(daysBack) || daysBack < 0) {
    throw new RangeError("daysBack must be a non-negative integer");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("now must be a valid Date");
  }

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const parts = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - daysBack);
  return {
    fromDate: start.toISOString().slice(0, 10),
    toDate: today,
  };
}

