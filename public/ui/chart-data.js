export function mapFyersCandles(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Fyers did not return a candles array.");
  }

  const candlesByTime = new Map();
  rows.forEach((row, index) => {
    if (
      !Array.isArray(row) ||
      row.length < 6 ||
      !Number.isSafeInteger(row[0]) ||
      !row.slice(1, 6).every((value) => typeof value === "number" && Number.isFinite(value))
    ) {
      throw new Error(`Fyers returned an invalid candle at row ${index + 1}.`);
    }

    const [time, open, high, low, close, volume] = row;
    if (volume < 0 || low > high) {
      throw new Error(`Fyers returned invalid OHLCV values at row ${index + 1}.`);
    }
    candlesByTime.set(time, { time, open, high, low, close, volume });
  });

  return [...candlesByTime.values()].sort((left, right) => left.time - right.time);
}
