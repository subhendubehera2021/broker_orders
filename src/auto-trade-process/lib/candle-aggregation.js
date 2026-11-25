const ONE_MINUTE_MS = 60 * 1000;
const THREE_MINUTES_MS = 3 * ONE_MINUTE_MS;

export function aggregateOneMinuteBarsToThreeMinutes(bars) {
  if (!Array.isArray(bars)) {
    throw new TypeError("Historical candles must be an array");
  }

  const buckets = new Map();
  for (const bar of bars) {
    const timestamp = Date.parse(bar.timestamp);
    if (!Number.isFinite(timestamp)) {
      throw new Error("Cannot aggregate a candle with an invalid timestamp");
    }

    const bucketStart = Math.floor(timestamp / THREE_MINUTES_MS) * THREE_MINUTES_MS;
    const bucket = buckets.get(bucketStart) ?? [];
    bucket.push(bar);
    buckets.set(bucketStart, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([bucketStart, bucket]) => {
      bucket.sort(
        (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
      );
      if (
        bucket.length !== 3 ||
        bucket.some(
          (bar, index) =>
            Date.parse(bar.timestamp) !== bucketStart + index * ONE_MINUTE_MS,
        )
      ) {
        return [];
      }

      return [{
        timestamp: new Date(bucketStart).toISOString(),
        open: bucket[0].open,
        high: Math.max(...bucket.map((bar) => bar.high)),
        low: Math.min(...bucket.map((bar) => bar.low)),
        close: bucket[2].close,
        volume: bucket.reduce((total, bar) => total + bar.volume, 0),
      }];
    });
}
