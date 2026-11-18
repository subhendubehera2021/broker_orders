function isPivotHigh(bars, index, lookback) {
  const pivot = bars[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    if (pivot.high < bars[index - distance].high || pivot.high <= bars[index + distance].high) {
      return false;
    }
  }
  return true;
}

function isPivotLow(bars, index, lookback) {
  const pivot = bars[index];
  for (let distance = 1; distance <= lookback; distance += 1) {
    if (pivot.low > bars[index - distance].low || pivot.low >= bars[index + distance].low) {
      return false;
    }
  }
  return true;
}

export function findLiquiditySwings(inputBars, lookback = 14) {
  if (!Array.isArray(inputBars)) {
    throw new TypeError("Candles must be an array");
  }
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new RangeError("Pivot lookback must be a positive integer");
  }

  const bars = [...inputBars].sort((left, right) => left.time - right.time);
  const pivots = [];
  for (let index = lookback; index + lookback < bars.length; index += 1) {
    if (isPivotHigh(bars, index, lookback)) {
      pivots.push({ index, side: "high", level: bars[index].high });
    }
    if (isPivotLow(bars, index, lookback)) {
      pivots.push({ index, side: "low", level: bars[index].low });
    }
  }

  return pivots.flatMap((pivot, index) => {
    const nextPivot = pivots.slice(index + 1).find((candidate) => candidate.side === pivot.side);
    const startTime = bars[pivot.index].time;
    const endTime = nextPivot ? bars[nextPivot.index].time : bars.at(-1)?.time;
    if (!Number.isFinite(endTime) || endTime <= startTime) return [];
    return [{ ...pivot, startTime, endTime }];
  });
}
