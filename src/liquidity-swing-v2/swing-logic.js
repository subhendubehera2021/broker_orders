/*
 * Adapted from Liquidity Swings [LuxAlgo], © LuxAlgo, CC BY-NC-SA 4.0:
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This adaptation is subject to the same license and noncommercial restriction.
 */
const MAX_SWINGS = 500;
const DEFAULT_OPTIONS = {
  pivotLookback: 14,
  area: "wick",
  filterBy: "count",
  filterValue: 0,
  intrabarPrecision: false,
};

function isPivotHigh(bars, index, lookback) {
  const pivot = bars[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    if (
      pivot.high < bars[index - distance].high ||
      pivot.high <= bars[index + distance].high
    ) {
      return false;
    }
  }
  return true;
}

function isPivotLow(bars, index, lookback) {
  const pivot = bars[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    if (
      pivot.low > bars[index - distance].low ||
      pivot.low >= bars[index + distance].low
    ) {
      return false;
    }
  }
  return true;
}

function intersects(bar, top, bottom) {
  return bar.low < top && bar.high > bottom;
}

function groupIntrabarBars(bars, intrabarBars) {
  const grouped = Array.from({ length: bars.length }, () => []);
  let intrabarIndex = 0;

  for (let index = 0; index < bars.length; index += 1) {
    const start = Date.parse(bars[index].timestamp);
    const end = index + 1 < bars.length
      ? Date.parse(bars[index + 1].timestamp)
      : Number.POSITIVE_INFINITY;
    while (
      intrabarIndex < intrabarBars.length &&
      Date.parse(intrabarBars[intrabarIndex].timestamp) < start
    ) {
      intrabarIndex += 1;
    }
    while (
      intrabarIndex < intrabarBars.length &&
      Date.parse(intrabarBars[intrabarIndex].timestamp) < end
    ) {
      grouped[index].push(intrabarBars[intrabarIndex]);
      intrabarIndex += 1;
    }
  }

  return grouped;
}

function makeSwing(bars, pivotIndex, lookback, side, options, intrabarGroups) {
  const pivot = bars[pivotIndex];
  const confirmedIndex = pivotIndex + lookback;
  const high = side === "high";
  const zoneTop = high
    ? pivot.high
    : options.area === "full" ? pivot.high : Math.min(pivot.open, pivot.close);
  const zoneBottom = high
    ? options.area === "full" ? pivot.low : Math.max(pivot.open, pivot.close)
    : pivot.low;
  let intersectionCount = 0;
  let intersectionVolume = 0;
  let brokenIndex;

  for (let index = pivotIndex + 1; index < bars.length; index += 1) {
    const bar = bars[index];
    if (intersects(bar, zoneTop, zoneBottom)) {
      intersectionCount += 1;
      if (options.intrabarPrecision) {
        for (const intrabar of intrabarGroups[index]) {
          if (intersects(intrabar, zoneTop, zoneBottom)) {
            intersectionVolume += intrabar.volume;
          }
        }
      } else {
        intersectionVolume += bar.volume;
      }
    }
    if (
      brokenIndex === undefined &&
      index > confirmedIndex &&
      (high ? bar.close > zoneTop : bar.close < zoneBottom)
    ) {
      brokenIndex = index;
    }
  }

  const targetValue = options.filterBy === "count"
    ? intersectionCount
    : intersectionVolume;
  const qualified = targetValue > options.filterValue;
  const lastIndex = bars.length - 1;
  const zoneEndIndex = Math.min(lastIndex, pivotIndex + intersectionCount);
  const status = brokenIndex !== undefined
    ? "broken"
    : qualified ? "qualified" : "tracking";

  return {
    side,
    pivotIndex,
    pivotTime: pivot.timestamp,
    confirmedAt: bars[confirmedIndex].timestamp,
    level: high ? pivot.high : pivot.low,
    zoneTop,
    zoneBottom,
    intersectionCount,
    intersectionVolume,
    targetValue,
    qualified,
    zoneEndIndex,
    lineEndIndex: brokenIndex === undefined ? lastIndex + 3 : brokenIndex,
    status,
    ...(brokenIndex === undefined ? {} : { brokenAt: bars[brokenIndex].timestamp }),
  };
}

export function findLiquiditySwings(inputBars, options = {}) {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isInteger(resolved.pivotLookback) || resolved.pivotLookback < 1) {
    throw new RangeError("pivotLookback must be a positive integer");
  }
  if (resolved.area !== "wick" && resolved.area !== "full") {
    throw new RangeError("area must be wick or full");
  }
  if (resolved.filterBy !== "count" && resolved.filterBy !== "volume") {
    throw new RangeError("filterBy must be count or volume");
  }
  if (!Number.isFinite(resolved.filterValue) || resolved.filterValue < 0) {
    throw new RangeError("filterValue must be a non-negative number");
  }
  if (typeof resolved.intrabarPrecision !== "boolean") {
    throw new TypeError("intrabarPrecision must be a boolean");
  }
  if (!Array.isArray(inputBars)) {
    throw new TypeError("Historical candles must be an array");
  }
  if (resolved.intrabarPrecision && !Array.isArray(resolved.intrabarBars)) {
    throw new TypeError("Intrabar candles must be an array when intrabar precision is enabled");
  }

  const bars = [...inputBars].sort(
    (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
  );
  const intrabarBars = resolved.intrabarPrecision
    ? [...resolved.intrabarBars].sort(
      (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
    )
    : [];
  const intrabarGroups = resolved.intrabarPrecision
    ? groupIntrabarBars(bars, intrabarBars)
    : [];
  const candidates = [];

  for (
    let pivotIndex = resolved.pivotLookback;
    pivotIndex + resolved.pivotLookback < bars.length;
    pivotIndex += 1
  ) {
    if (isPivotHigh(bars, pivotIndex, resolved.pivotLookback)) {
      candidates.push({ pivotIndex, side: "high" });
    }
    if (isPivotLow(bars, pivotIndex, resolved.pivotLookback)) {
      candidates.push({ pivotIndex, side: "low" });
    }
  }

  const visibleSwings = candidates
    .slice(-MAX_SWINGS)
    .map(({ pivotIndex, side }) =>
      makeSwing(bars, pivotIndex, resolved.pivotLookback, side, resolved, intrabarGroups));
  const highs = visibleSwings.filter((swing) => swing.side === "high");
  const lows = visibleSwings.filter((swing) => swing.side === "low");

  for (const sideSwings of [highs, lows]) {
    for (let index = 0; index + 1 < sideSwings.length; index += 1) {
      const swing = sideSwings[index];
      const nextSwing = sideSwings[index + 1];
      const wasBrokenBeforeNextSwing = swing.brokenAt !== undefined &&
        Date.parse(swing.brokenAt) <= Date.parse(nextSwing.pivotTime);

      if (!wasBrokenBeforeNextSwing) {
        swing.lineEndIndex = nextSwing.pivotIndex;
        if (swing.brokenAt !== undefined) {
          swing.status = swing.qualified ? "qualified" : "tracking";
          delete swing.brokenAt;
        }
      }
    }
  }

  return {
    swings: visibleSwings,
    highs,
    lows,
  };
}

export function findLatestLiquiditySwingHigh(inputBars, options = {}) {
  return findLiquiditySwings(inputBars, options).highs.at(-1);
}
