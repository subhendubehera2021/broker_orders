/*
 * Adapted from the existing app's liquidity-swing analyzer, which is based on
 * Liquidity Swings [LuxAlgo], © LuxAlgo, CC BY-NC-SA 4.0:
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This adaptation is subject to the same license and noncommercial restriction.
 */
import { createKotakApiUrl } from "../kotak-api.js";

const DEFAULT_OPTIONS = {
  interval: "1min",
  pivotLookback: 5,
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCandle(row, index) {
  if (
    !Array.isArray(row) ||
    typeof row[0] !== "string" ||
    !Number.isFinite(Date.parse(row[0])) ||
    row.length < 6 ||
    !row.slice(1, 6).every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    throw new Error(`Kotak returned an invalid historical candle at row ${index}`);
  }
  const [timestamp, open, high, low, close, volume] = row;
  if (
    low > high ||
    low > Math.min(open, close) ||
    high < Math.max(open, close) ||
    volume < 0
  ) {
    throw new Error(`Kotak returned invalid OHLCV values at candle row ${index}`);
  }
  return { timestamp, open, high, low, close, volume };
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
  const bars = [...inputBars].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
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
  instrument,
  {
    apiToken,
    baseUrl,
    fromDate,
    toDate,
    interval = DEFAULT_OPTIONS.interval,
    pivotLookback = DEFAULT_OPTIONS.pivotLookback,
  },
  fetchImpl = fetch,
) {
  if (typeof instrument?.token !== "string" || !instrument.token.startsWith("nse_fo|")) {
    throw new Error("A valid NIFTY option Neo symbol is required for swing analysis");
  }
  if (typeof apiToken !== "string" || apiToken.trim() === "") {
    throw new Error("Missing required environment variable: KOTAK_NEO_API_TOKEN");
  }
  if (
    !isValidDateOnly(fromDate) ||
    !isValidDateOnly(toDate) ||
    toDate < fromDate
  ) {
    throw new Error("Historical candle dates must be valid YYYY-MM-DD dates in ascending order");
  }
  if (!["1min", "3min", "5min", "10min", "15min", "30min", "60min", "D", "W"].includes(interval)) {
    throw new RangeError("Unsupported Kotak historical candle interval");
  }
  if (!Number.isInteger(pivotLookback) || pivotLookback < 1) {
    throw new RangeError("pivotLookback must be a positive integer");
  }

  const endpoint = createKotakApiUrl(
    baseUrl,
    "market-data/1.0/historical/details",
    {
      neosymbol: instrument.token,
      fromdate: fromDate,
      todate: toDate,
      interval,
    },
  );
  const response = await fetchImpl(endpoint, {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const retryHint =
      response.status === 429 && retryAfter && /^\d+$/.test(retryAfter)
        ? ` (retry after ${retryAfter}s)`
        : "";
    throw new Error(
      `Kotak historical-candle request failed with HTTP ${response.status}${retryHint}`,
    );
  }

  const payload = await response.json();
  if (
    !isRecord(payload) ||
    typeof payload.status !== "string" ||
    payload.status.toLowerCase() !== "success" ||
    !isRecord(payload.data) ||
    !Array.isArray(payload.data.candles)
  ) {
    throw new Error("Kotak returned invalid historical candle data");
  }
  const bars = payload.data.candles.map(parseCandle);
  return {
    bars,
    swing: findLatestLiquiditySwingHigh(bars, { pivotLookback }),
    interval,
    pivotLookback,
  };
}

export function recentIndiaDateRange(now = new Date(), daysBack = 3) {
  if (!Number.isInteger(daysBack) || daysBack < 0) {
    throw new RangeError("daysBack must be a non-negative integer");
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

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
