/*
 * Chart-only liquidity swing levels based on Liquidity Swings [LuxAlgo],
 * CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This adaptation is noncommercial and shared under the same license.
 */
export const DEFAULT_PIVOT_LOOKBACK = 5;
const MAX_SWINGS_PER_SIDE = 16;

function isPivotHigh(candles, index, lookback) {
  const pivot = candles[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    const older = candles[index - distance];
    const newer = candles[index + distance];
    if (pivot.high < older.high || pivot.high <= newer.high) {
      return false;
    }
  }
  return true;
}

function isPivotLow(candles, index, lookback) {
  const pivot = candles[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    const older = candles[index - distance];
    const newer = candles[index + distance];
    if (pivot.low > older.low || pivot.low >= newer.low) {
      return false;
    }
  }
  return true;
}

function intersects(candle, top, bottom) {
  return candle.low < top && candle.high > bottom;
}

function makeSwing(candles, pivotIndex, lookback, side) {
  const pivot = candles[pivotIndex];
  const isHigh = side === "high";
  const zoneTop = isHigh ? pivot.high : Math.min(pivot.open, pivot.close);
  const zoneBottom = isHigh ? Math.max(pivot.open, pivot.close) : pivot.low;
  const confirmedAt = pivotIndex + lookback;
  let intersectionCount = 0;
  let intersectionVolume = 0;
  let brokenAt;

  for (let index = confirmedAt + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (isHigh ? candle.close > pivot.high : candle.close < pivot.low) {
      brokenAt = candle.time;
      break;
    }
    if (intersects(candle, zoneTop, zoneBottom)) {
      intersectionCount += 1;
      intersectionVolume += candle.volume;
    }
  }

  return {
    side,
    pivotTime: pivot.time,
    confirmedAt: candles[confirmedAt].time,
    level: isHigh ? pivot.high : pivot.low,
    zoneTop,
    zoneBottom,
    intersectionCount,
    intersectionVolume,
    pivotVolume: pivot.volume,
    status: brokenAt ? "broken" : intersectionCount > 0 ? "qualified" : "tracking",
    ...(brokenAt ? { brokenAt } : {}),
  };
}

export function findLiquiditySwings(candles, pivotLookback = DEFAULT_PIVOT_LOOKBACK) {
  if (!Number.isInteger(pivotLookback) || pivotLookback < 1) {
    throw new RangeError("pivotLookback must be a positive integer");
  }
  if (!Array.isArray(candles)) {
    throw new TypeError("Candles must be an array");
  }

  const orderedCandles = candles.map((candle, index) => {
    if (
      typeof candle?.time !== "number" ||
      !Number.isSafeInteger(candle.time) ||
      ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      ) ||
      candle.low > candle.high ||
      candle.volume < 0
    ) {
      throw new Error(`Invalid OHLCV candle at row ${index + 1}`);
    }
    return candle;
  }).sort((left, right) => left.time - right.time);
  const highPivots = [];
  const lowPivots = [];

  for (
    let pivotIndex = pivotLookback;
    pivotIndex + pivotLookback < orderedCandles.length;
    pivotIndex += 1
  ) {
    if (isPivotHigh(orderedCandles, pivotIndex, pivotLookback)) {
      highPivots.push(pivotIndex);
    }
    if (isPivotLow(orderedCandles, pivotIndex, pivotLookback)) {
      lowPivots.push(pivotIndex);
    }
  }

  return {
    highs: highPivots
      .slice(-MAX_SWINGS_PER_SIDE)
      .map((index) => makeSwing(orderedCandles, index, pivotLookback, "high")),
    lows: lowPivots
      .slice(-MAX_SWINGS_PER_SIDE)
      .map((index) => makeSwing(orderedCandles, index, pivotLookback, "low")),
  };
}
