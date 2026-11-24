/*
 * Order-block features adapted from Smart Money Concepts [LuxAlgo],
 * © LuxAlgo, licensed under CC BY-NC-SA 4.0:
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This modified adaptation is subject to the same license and noncommercial
 * restriction. It is not affiliated with or endorsed by LuxAlgo.
 */
const BULLISH = 1;
const BEARISH = -1;
const ATR_LENGTH = 200;
const INTERNAL_PIVOT_LENGTH = 5;
const SWING_PIVOT_LENGTH = 50;
const DEFAULT_ORDER_BLOCK_COUNT = 11;
const MAX_ORDER_BLOCK_COUNT = 20;

function findPivots(bars, length) {
  const pivots = [];
  for (let index = length; index + length < bars.length; index += 1) {
    const bar = bars[index];
    let high = true;
    let low = true;
    for (let offset = 1; offset <= length && (high || low); offset += 1) {
      if (bar.high < bars[index - offset].high || bar.high <= bars[index + offset].high) high = false;
      if (bar.low > bars[index - offset].low || bar.low >= bars[index + offset].low) low = false;
    }
    if (high) pivots.push({ index, side: "high", price: bar.high });
    if (low) pivots.push({ index, side: "low", price: bar.low });
  }
  return pivots.sort((left, right) => left.index - right.index || left.side.localeCompare(right.side));
}

function findStructureEvents(bars, pivots, length, kind) {
  const confirmedAt = new Map();
  for (const pivot of pivots) {
    const index = pivot.index + length;
    const group = confirmedAt.get(index) ?? [];
    group.push(pivot);
    confirmedAt.set(index, group);
  }

  const latest = { high: undefined, low: undefined };
  const crossed = new Set();
  const events = [];

  for (let index = 0; index < bars.length; index += 1) {
    for (const pivot of confirmedAt.get(index) ?? []) latest[pivot.side] = pivot;

    for (const side of ["high", "low"]) {
      const pivot = latest[side];
      if (!pivot || crossed.has(pivot)) continue;
      const broken = side === "high" ? bars[index].close > pivot.price : bars[index].close < pivot.price;
      if (!broken) continue;

      const direction = side === "high" ? BULLISH : BEARISH;
      events.push({
        kind,
        direction,
        index,
        pivotIndex: pivot.index,
      });
      crossed.add(pivot);
    }
  }

  return events;
}

function getParsedExtremes(bars) {
  const parsedHighs = [];
  const parsedLows = [];
  let atr;
  let initialRangeTotal = 0;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const previousClose = bars[index - 1]?.close;
    const trueRange = previousClose === undefined
      ? bar.high - bar.low
      : Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - previousClose),
        Math.abs(bar.low - previousClose),
      );

    if (index < ATR_LENGTH) {
      initialRangeTotal += trueRange;
      if (index === ATR_LENGTH - 1) atr = initialRangeTotal / ATR_LENGTH;
    } else {
      atr = ((atr * (ATR_LENGTH - 1)) + trueRange) / ATR_LENGTH;
    }

    const highVolatility = Number.isFinite(atr) && bar.high - bar.low >= 2 * atr;
    parsedHighs.push(highVolatility ? bar.low : bar.high);
    parsedLows.push(highVolatility ? bar.high : bar.low);
  }

  return { parsedHighs, parsedLows };
}

function findOrderBlocks(bars, events, count, parsedHighs, parsedLows) {
  const blocks = [];

  for (const event of events) {
    let originIndex = -1;
    let extreme = event.direction === BULLISH ? Infinity : -Infinity;

    for (let index = event.pivotIndex; index < event.index; index += 1) {
      const candidate = event.direction === BULLISH ? parsedLows[index] : parsedHighs[index];
      const isMoreExtreme = event.direction === BULLISH ? candidate < extreme : candidate > extreme;
      if (isMoreExtreme) {
        extreme = candidate;
        originIndex = index;
      }
    }
    if (originIndex < 0) continue;

    const top = parsedHighs[originIndex];
    const bottom = parsedLows[originIndex];
    if (!(top > bottom)) continue;

    let mitigated = false;
    for (let index = event.index; index < bars.length; index += 1) {
      if (event.direction === BULLISH ? bars[index].low < bottom : bars[index].high > top) {
        mitigated = true;
        break;
      }
    }
    if (mitigated) continue;

    blocks.push({
      startTime: bars[originIndex].time,
      endTime: bars.at(-1).time,
      top,
      bottom,
      direction: event.direction,
      kind: event.kind,
    });
  }

  return blocks.slice(-count);
}

function validateCount(name, value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_ORDER_BLOCK_COUNT) {
    throw new RangeError(`${name} must be an integer between 1 and ${MAX_ORDER_BLOCK_COUNT}`);
  }
}

export function calculateSmartMoneyConcepts(bars, options = {}) {
  if (!Array.isArray(bars)) throw new TypeError("Candles must be an array");
  if (bars.some((bar, index) =>
    !bar ||
    !Number.isFinite(bar.time) ||
    !Number.isFinite(bar.open) ||
    !Number.isFinite(bar.high) ||
    !Number.isFinite(bar.low) ||
    !Number.isFinite(bar.close) ||
    (index > 0 && bar.time <= bars[index - 1].time)
  )) {
    throw new TypeError("Candles must be valid and sorted by time");
  }

  const internalPivotLength = options.internalPivotLength ?? INTERNAL_PIVOT_LENGTH;
  const swingPivotLength = options.swingPivotLength ?? SWING_PIVOT_LENGTH;
  const internalCount = options.internalOrderBlockCount ?? DEFAULT_ORDER_BLOCK_COUNT;
  const swingCount = options.swingOrderBlockCount ?? DEFAULT_ORDER_BLOCK_COUNT;
  if (!Number.isInteger(internalPivotLength) || internalPivotLength < 1) {
    throw new RangeError("Internal pivot length must be a positive integer");
  }
  if (!Number.isInteger(swingPivotLength) || swingPivotLength < 2) {
    throw new RangeError("Swing pivot length must be an integer greater than or equal to 2");
  }
  validateCount("Internal order-block length", internalCount);
  validateCount("Swing order-block length", swingCount);

  const internalPivots = findPivots(bars, internalPivotLength);
  const swingPivots = findPivots(bars, swingPivotLength);
  const internalEvents = findStructureEvents(bars, internalPivots, internalPivotLength, "internal");
  const swingEvents = findStructureEvents(bars, swingPivots, swingPivotLength, "swing");
  const { parsedHighs, parsedLows } = getParsedExtremes(bars);

  return {
    orderBlocks: {
      internal: findOrderBlocks(bars, internalEvents, internalCount, parsedHighs, parsedLows),
      swing: findOrderBlocks(bars, swingEvents, swingCount, parsedHighs, parsedLows),
    },
  };
}
