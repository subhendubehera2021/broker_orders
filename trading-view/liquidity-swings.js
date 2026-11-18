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
    const pivotBar = bars[pivot.index];
    const segmentEndIndex = nextPivot?.index ?? bars.length;
    const zoneEndIndex = Math.min(pivot.index + lookback, segmentEndIndex - 1);
    const startTime = pivotBar.time;
    const endTime = nextPivot ? bars[nextPivot.index].time : bars.at(-1)?.time;
    if (!Number.isFinite(endTime) || endTime <= startTime) return [];

    let breakBar;
    const breakLimit = nextPivot?.index ?? bars.length - 1;
    for (let candidateIndex = pivot.index + 1; candidateIndex <= breakLimit; candidateIndex += 1) {
      const candidate = bars[candidateIndex];
      const brokeLevel = pivot.side === "high"
        ? candidate.high > pivot.level
        : candidate.low < pivot.level;
      if (brokeLevel) {
        breakBar = candidate;
        break;
      }
    }

    const hasBody = Number.isFinite(pivotBar.open) && Number.isFinite(pivotBar.close);
    const bodyHigh = hasBody ? Math.max(pivotBar.open, pivotBar.close) : pivot.level;
    const bodyLow = hasBody ? Math.min(pivotBar.open, pivotBar.close) : pivot.level;
    const candleRange = Math.max(0, pivotBar.high - pivotBar.low);
    const minimumZoneDepth = candleRange * 0.12;
    const zoneTop = pivot.side === "low"
      ? pivot.level + Math.max(bodyLow - pivot.level, minimumZoneDepth)
      : pivot.level;
    const zoneBottom = pivot.side === "high"
      ? pivot.level - Math.max(pivot.level - bodyHigh, minimumZoneDepth)
      : pivot.level;
    const volume = bars.slice(pivot.index, segmentEndIndex).reduce((total, bar) => {
      const value = Number(bar.volume);
      return total + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);

    return [{
      ...pivot,
      startTime,
      endTime,
      zoneEndTime: bars[zoneEndIndex]?.time,
      zoneTop,
      zoneBottom,
      startVolume: Number.isFinite(pivotBar.volume) ? pivotBar.volume : undefined,
      volume,
      breakTime: breakBar?.time,
      breakVolume: Number.isFinite(Number(breakBar?.volume)) ? Number(breakBar.volume) : undefined,
    }];
  });
}
