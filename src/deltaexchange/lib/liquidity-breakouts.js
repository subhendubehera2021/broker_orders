function validateCandle(candle, index) {
  if (
    !candle ||
    !Number.isSafeInteger(candle.time) ||
    ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) ||
    candle.low > candle.high ||
    candle.low > Math.min(candle.open, candle.close) ||
    candle.high < Math.max(candle.open, candle.close) ||
    candle.volume < 0
  ) {
    throw new Error(`Delta Exchange returned invalid OHLCV values at candle row ${index}`);
  }
  return candle;
}

export function analyzeLiquidityBreakouts(inputCandles, liquiditySwings) {
  if (!Array.isArray(inputCandles)) {
    throw new TypeError("Candles must be an array");
  }
  if (
    !liquiditySwings ||
    !Array.isArray(liquiditySwings.highs) ||
    !Array.isArray(liquiditySwings.lows)
  ) {
    throw new TypeError("Liquidity swings must contain high and low arrays");
  }

  const candles = inputCandles
    .map(validateCandle)
    .sort((left, right) => left.time - right.time);
  const candleIndices = new Map(candles.map((candle, index) => [candle.time, index]));
  const breakouts = [];

  for (const swing of [...liquiditySwings.highs, ...liquiditySwings.lows]) {
    if (swing.status !== "broken") {
      continue;
    }

    const breakoutTime = Date.parse(swing.brokenAt) / 1000;
    const breakoutIndex = candleIndices.get(breakoutTime);
    if (breakoutIndex === undefined) {
      throw new Error(`Missing breakout candle for liquidity swing at ${swing.brokenAt}`);
    }

    const breakoutCandle = candles[breakoutIndex];
    const isUpside = swing.side === "high";
    const stopLoss = isUpside ? breakoutCandle.low : breakoutCandle.high;
    let maxFavorablePoints = 0;
    let maxFavorableTime = null;
    let stopHitAt = null;

    for (let index = breakoutIndex + 1; index < candles.length; index += 1) {
      const candle = candles[index];
      if (isUpside ? candle.low <= stopLoss : candle.high >= stopLoss) {
        stopHitAt = candle.time;
        break;
      }

      const favorablePoints = isUpside
        ? candle.high - swing.level
        : swing.level - candle.low;
      if (favorablePoints > maxFavorablePoints) {
        maxFavorablePoints = favorablePoints;
        maxFavorableTime = candle.time;
      }
    }

    breakouts.push({
      side: swing.side,
      pivotTime: swing.pivotTime,
      confirmedAt: swing.confirmedAt,
      breakoutTime: breakoutCandle.time,
      breakoutExtreme: isUpside ? breakoutCandle.high : breakoutCandle.low,
      level: swing.level,
      stopLoss,
      maxFavorablePoints,
      maxFavorableTime,
      stopHitAt,
    });
  }

  return breakouts.sort((left, right) => left.breakoutTime - right.breakoutTime);
}
