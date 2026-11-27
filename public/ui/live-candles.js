export function createLiveCandleAggregator(
  intervalMinutes,
  lastCandle,
  initialCumulativeVolume = null,
) {
  const interval = Number(intervalMinutes);
  if (![1, 3, 5, 15].includes(interval)) {
    throw new RangeError("Live candle interval must be 1, 3, 5, or 15 minutes.");
  }

  let currentCandle = lastCandle
    ? {
      ...lastCandle,
      volume: Number.isFinite(lastCandle.volume) ? lastCandle.volume : 0,
    }
    : null;
  let previousCumulativeVolume = Number.isFinite(initialCumulativeVolume)
    ? initialCumulativeVolume
    : null;

  return {
    update(tick) {
      if (
        !tick ||
        !Number.isSafeInteger(tick.time) ||
        !Number.isFinite(tick.price)
      ) {
        return null;
      }

      const intervalSeconds = interval * 60;
      const candleTime = Math.floor(tick.time / intervalSeconds) * intervalSeconds;
      if (currentCandle && candleTime < currentCandle.time) {
        return null;
      }

      let volumeDelta = 0;
      if (Number.isFinite(tick.cumulativeVolume)) {
        if (
          previousCumulativeVolume !== null &&
          tick.cumulativeVolume >= previousCumulativeVolume
        ) {
          volumeDelta = tick.cumulativeVolume - previousCumulativeVolume;
        }
        previousCumulativeVolume = tick.cumulativeVolume;
      }

      const isNewBar = !currentCandle || candleTime > currentCandle.time;
      if (isNewBar) {
        currentCandle = {
          time: candleTime,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: volumeDelta,
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, tick.price);
        currentCandle.low = Math.min(currentCandle.low, tick.price);
        currentCandle.close = tick.price;
        currentCandle.volume += volumeDelta;
      }

      return { candle: { ...currentCandle }, isNewBar };
    },
  };
}
