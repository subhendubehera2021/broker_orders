/*
 * JavaScript adaptation of the order-block logic from Smart Money Concepts
 * [LuxAlgo] by LuxAlgo, based on the user-provided Pine Script v5.
 * Changes: operates on JavaScript candle arrays and returns chart-ready zones.
 * Licensed CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/
 */

const BULLISH = 1;
const BEARISH = -1;
const ATR_LENGTH = 200;
const MAX_STORED_BLOCKS = 100;

function calculateAtr(candles) {
  const atrValues = Array(candles.length).fill(undefined);
  let average = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1]?.close;
    const trueRange = previousClose === undefined
      ? candle.high - candle.low
      : Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      );
    if (index < ATR_LENGTH) {
      average += trueRange;
      if (index === ATR_LENGTH - 1) {
        atrValues[index] = average / ATR_LENGTH;
      }
    } else {
      atrValues[index] = ((atrValues[index - 1] * (ATR_LENGTH - 1)) + trueRange) / ATR_LENGTH;
    }
  }

  return atrValues;
}

function findParsedCandles(candles, atrValues) {
  const parsedHighs = [];
  const parsedLows = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const isHighVolatility = Number.isFinite(atrValues[index]) &&
      candle.high - candle.low >= 2 * atrValues[index];
    parsedHighs.push(isHighVolatility ? candle.low : candle.high);
    parsedLows.push(isHighVolatility ? candle.high : candle.low);
  }

  return { parsedHighs, parsedLows };
}

function createStructure() {
  return {
    leg: 0,
    bias: 0,
    high: undefined,
    low: undefined,
  };
}

function updateStructurePivot(candles, index, length, structure) {
  const pivotIndex = index - length;
  if (pivotIndex < 0) {
    return;
  }

  let highestAfterPivot = -Infinity;
  let lowestAfterPivot = Infinity;
  for (let followingIndex = pivotIndex + 1; followingIndex <= index; followingIndex += 1) {
    highestAfterPivot = Math.max(highestAfterPivot, candles[followingIndex].high);
    lowestAfterPivot = Math.min(lowestAfterPivot, candles[followingIndex].low);
  }

  const newLegHigh = candles[pivotIndex].high > highestAfterPivot;
  const newLegLow = candles[pivotIndex].low < lowestAfterPivot;
  const nextLeg = newLegHigh ? 0 : newLegLow ? 1 : structure.leg;
  if (nextLeg === structure.leg) {
    return;
  }

  structure.leg = nextLeg;
  if (nextLeg === 1) {
    structure.low = { index: pivotIndex, level: candles[pivotIndex].low, crossed: false };
  } else {
    structure.high = { index: pivotIndex, level: candles[pivotIndex].high, crossed: false };
  }
}

function crossedAbove(previousClose, close, level) {
  return previousClose !== undefined && previousClose <= level && close > level;
}

function crossedBelow(previousClose, close, level) {
  return previousClose !== undefined && previousClose >= level && close < level;
}

function storeOrderBlock(candles, parsedHighs, parsedLows, pivot, index, bias, kind, blocks) {
  let selectedIndex = pivot.index;
  for (let candleIndex = pivot.index + 1; candleIndex < index; candleIndex += 1) {
    const moreExtreme = bias === BEARISH
      ? parsedHighs[candleIndex] > parsedHighs[selectedIndex]
      : parsedLows[candleIndex] < parsedLows[selectedIndex];
    if (moreExtreme) {
      selectedIndex = candleIndex;
    }
  }

  const firstBoundary = parsedHighs[selectedIndex];
  const secondBoundary = parsedLows[selectedIndex];
  blocks.unshift({
    kind,
    bias,
    time: candles[selectedIndex].time,
    top: Math.max(firstBoundary, secondBoundary),
    bottom: Math.min(firstBoundary, secondBoundary),
  });
  if (blocks.length > MAX_STORED_BLOCKS) {
    blocks.pop();
  }
}

function removeMitigatedBlocks(blocks, candle) {
  return blocks.filter((block) => {
    if (block.bias === BEARISH) {
      return candle.high <= block.top;
    }
    return candle.low >= block.bottom;
  });
}

function updateStructure(
  candles,
  parsedHighs,
  parsedLows,
  index,
  structure,
  otherStructure,
  kind,
  enabled,
  pivotLength,
  blocks,
) {
  if (!enabled) {
    return;
  }

  updateStructurePivot(candles, index, pivotLength, structure);
  const candle = candles[index];
  const previousClose = candles[index - 1]?.close;

  if (
    structure.high &&
    !structure.high.crossed &&
    crossedAbove(previousClose, candle.close, structure.high.level) &&
    (kind !== "internal" || !otherStructure.high || structure.high.level !== otherStructure.high.level)
  ) {
    structure.high.crossed = true;
    structure.bias = BULLISH;
    storeOrderBlock(
      candles,
      parsedHighs,
      parsedLows,
      structure.high,
      index,
      BULLISH,
      kind,
      blocks,
    );
  }

  if (
    structure.low &&
    !structure.low.crossed &&
    crossedBelow(previousClose, candle.close, structure.low.level) &&
    (kind !== "internal" || !otherStructure.low || structure.low.level !== otherStructure.low.level)
  ) {
    structure.low.crossed = true;
    structure.bias = BEARISH;
    storeOrderBlock(
      candles,
      parsedHighs,
      parsedLows,
      structure.low,
      index,
      BEARISH,
      kind,
      blocks,
    );
  }
}

export function calculateOrderBlocks(candles, {
  internalEnabled = true,
  swingEnabled = true,
  internalCount = 7,
  swingCount = 7,
  internalLength = 5,
  swingLength = 50,
} = {}) {
  const internalBlocks = [];
  const swingBlocks = [];
  if (candles.length === 0) {
    return { internal: internalBlocks, swing: swingBlocks };
  }

  const atrValues = calculateAtr(candles);
  const { parsedHighs, parsedLows } = findParsedCandles(candles, atrValues);
  const internalStructure = createStructure();
  const swingStructure = createStructure();

  for (let index = 0; index < candles.length; index += 1) {
    updateStructure(
      candles,
      parsedHighs,
      parsedLows,
      index,
      swingStructure,
      internalStructure,
      "swing",
      swingEnabled,
      swingLength,
      swingBlocks,
    );
    updateStructure(
      candles,
      parsedHighs,
      parsedLows,
      index,
      internalStructure,
      swingStructure,
      "internal",
      internalEnabled,
      internalLength,
      internalBlocks,
    );

    if (internalEnabled) {
      internalBlocks.splice(
        0,
        internalBlocks.length,
        ...removeMitigatedBlocks(internalBlocks, candles[index]),
      );
    }
    if (swingEnabled) {
      swingBlocks.splice(
        0,
        swingBlocks.length,
        ...removeMitigatedBlocks(swingBlocks, candles[index]),
      );
    }
  }

  return {
    internal: internalBlocks.slice(0, Math.max(0, internalCount)),
    swing: swingBlocks.slice(0, Math.max(0, swingCount)),
  };
}
