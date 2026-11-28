/*
 * Adapted from the existing app's liquidity-swing analyzer, which is based on
 * Liquidity Swings [LuxAlgo], © LuxAlgo, CC BY-NC-SA 4.0:
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This Delta Exchange adaptation is subject to the same attribution,
 * share-alike, and noncommercial requirements.
 */
const DEFAULT_OPTIONS = { pivotLookback: 5 };

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOhlcv(bar, index) {
  if (
    ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    throw new Error(`Delta Exchange returned invalid OHLCV values at candle row ${index}`);
  }
  if (
    bar.low > bar.high ||
    bar.low > Math.min(bar.open, bar.close) ||
    bar.high < Math.max(bar.open, bar.close) ||
    bar.volume < 0
  ) {
    throw new Error(`Delta Exchange returned invalid OHLCV values at candle row ${index}`);
  }
}

function validateBar(bar, index) {
  if (
    !isRecord(bar) ||
    typeof bar.timestamp !== "string" ||
    !Number.isFinite(Date.parse(bar.timestamp))
  ) {
    throw new Error(`Delta Exchange returned an invalid historical candle at row ${index}`);
  }
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

function isPivotLow(bars, index, lookback) {
  const pivot = bars[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    const older = bars[index - distance];
    const newer = bars[index + distance];
    if (pivot.low > older.low || pivot.low >= newer.low) {
      return false;
    }
  }
  return true;
}

function intersects(bar, top, bottom) {
  return bar.low < top && bar.high > bottom;
}

function makeSwing(bars, pivotIndex, lookback, side) {
  const pivot = bars[pivotIndex];
  const isHigh = side === "high";
  const zoneTop = isHigh ? pivot.high : Math.min(pivot.open, pivot.close);
  const zoneBottom = isHigh ? Math.max(pivot.open, pivot.close) : pivot.low;
  const confirmedAt = pivotIndex + lookback;
  let intersectionCount = 0;
  let intersectionVolume = 0;

  for (let index = confirmedAt + 1; index < bars.length; index += 1) {
    const bar = bars[index];
    if (isHigh ? bar.high > pivot.high : bar.low < pivot.low) {
      return {
        side,
        pivotTime: pivot.timestamp,
        confirmedAt: bars[confirmedAt].timestamp,
        level: isHigh ? pivot.high : pivot.low,
        zoneTop,
        zoneBottom,
        intersectionCount,
        intersectionVolume,
        pivotVolume: pivot.volume,
        status: "broken",
        brokenAt: bar.timestamp,
      };
    }
    if (intersects(bar, zoneTop, zoneBottom)) {
      intersectionCount += 1;
      intersectionVolume += bar.volume;
    }
  }

  return {
    side,
    pivotTime: pivot.timestamp,
    confirmedAt: bars[confirmedAt].timestamp,
    level: isHigh ? pivot.high : pivot.low,
    zoneTop,
    zoneBottom,
    intersectionCount,
    intersectionVolume,
    pivotVolume: pivot.volume,
    status: intersectionCount > 0 ? "qualified" : "tracking",
  };
}

function keepUnbrokenLatestLevels(swings) {
  return swings.filter((swing, index) => {
    const nextSwing = swings[index + 1];
    if (!nextSwing) {
      return true;
    }

    return swing.status === "broken" &&
      Date.parse(swing.brokenAt) <= Date.parse(nextSwing.confirmedAt);
  });
}

export function findLiquiditySwings(inputBars, options = {}) {
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
  const highs = [];
  const lows = [];

  for (
    let pivotIndex = pivotLookback;
    pivotIndex + pivotLookback < bars.length;
    pivotIndex += 1
  ) {
    if (isPivotHigh(bars, pivotIndex, pivotLookback)) {
      highs.push(makeSwing(bars, pivotIndex, pivotLookback, "high"));
    }
    if (isPivotLow(bars, pivotIndex, pivotLookback)) {
      lows.push(makeSwing(bars, pivotIndex, pivotLookback, "low"));
    }
  }

  return {
    highs: keepUnbrokenLatestLevels(highs),
    lows: keepUnbrokenLatestLevels(lows),
  };
}
