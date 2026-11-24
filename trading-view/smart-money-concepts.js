/*
 * Smart Money Concepts features adapted from Smart Money Concepts [LuxAlgo],
 * © LuxAlgo, licensed under CC BY-NC-SA 4.0:
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This modified adaptation is subject to the same license and noncommercial
 * restriction. It is not affiliated with or endorsed by LuxAlgo.
 */
const BULLISH = 1;
const BEARISH = -1;

function averageRange(bars, endIndex, length = 14) {
  const start = Math.max(1, endIndex - length + 1);
  let total = 0;
  for (let index = start; index <= endIndex; index += 1) {
    const bar = bars[index];
    const previousClose = bars[index - 1].close;
    total += Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  }
  return total / Math.max(1, endIndex - start + 1);
}

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

function findStructures(bars, pivots, length, kind) {
  const confirmedAt = new Map();
  for (const pivot of pivots) {
    const index = pivot.index + length;
    const group = confirmedAt.get(index) ?? [];
    group.push(pivot);
    confirmedAt.set(index, group);
  }

  const latest = { high: undefined, low: undefined };
  const crossed = new Set();
  const swings = [];
  const events = [];
  let bias = 0;

  for (let index = 0; index < bars.length; index += 1) {
    for (const pivot of confirmedAt.get(index) ?? []) {
      const previous = latest[pivot.side];
      swings.push({
        ...pivot,
        time: bars[pivot.index].time,
        kind,
        label: previous
          ? pivot.side === "high"
            ? pivot.price > previous.price ? "HH" : "LH"
            : pivot.price < previous.price ? "LL" : "HL"
          : pivot.side === "high" ? "H" : "L",
      });
      latest[pivot.side] = pivot;
    }

    for (const side of ["high", "low"]) {
      const pivot = latest[side];
      if (!pivot || crossed.has(pivot)) continue;
      const broken = side === "high" ? bars[index].close > pivot.price : bars[index].close < pivot.price;
      if (!broken) continue;
      crossed.add(pivot);
      const direction = side === "high" ? BULLISH : BEARISH;
      events.push({
        kind,
        side,
        direction,
        type: bias !== 0 && bias !== direction ? "CHoCH" : "BOS",
        startTime: bars[pivot.index].time,
        time: bars[index].time,
        index,
        pivotIndex: pivot.index,
        price: pivot.price,
      });
      bias = direction;
    }
  }

  return { events, swings, bias };
}

function findOrderBlocks(bars, events, maxCount) {
  const blocks = [];
  for (const event of events) {
    let origin;
    for (let index = event.pivotIndex + 1; index < event.index; index += 1) {
      const bar = bars[index];
      const opposite = event.direction === BULLISH ? bar.close < bar.open : bar.close > bar.open;
      if (opposite) origin = { bar, index };
    }
    if (!origin) continue;

    let mitigated = false;
    for (let index = event.index + 1; index < bars.length; index += 1) {
      if (event.direction === BULLISH && bars[index].low <= origin.bar.low) mitigated = true;
      if (event.direction === BEARISH && bars[index].high >= origin.bar.high) mitigated = true;
      if (mitigated) break;
    }
    if (!mitigated) {
      blocks.push({
        startTime: origin.bar.time,
        endTime: bars.at(-1).time,
        top: origin.bar.high,
        bottom: origin.bar.low,
        direction: event.direction,
        kind: event.kind,
      });
    }
  }
  return blocks.slice(-maxCount);
}

function findEqualLevels(bars, pivots, thresholdRatio) {
  const levels = [];
  for (const side of ["high", "low"]) {
    const points = pivots.filter((pivot) => pivot.side === side);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const threshold = averageRange(bars, current.index) * thresholdRatio;
      if (Math.abs(current.price - previous.price) <= threshold) {
        levels.push({
          startTime: bars[previous.index].time,
          endTime: bars[current.index].time,
          price: (previous.price + current.price) / 2,
          label: side === "high" ? "EQH" : "EQL",
          direction: side === "high" ? BEARISH : BULLISH,
        });
      }
    }
  }
  return levels;
}

function findFairValueGaps(bars, extendBars) {
  const gaps = [];
  for (let index = 2; index < bars.length; index += 1) {
    const first = bars[index - 2];
    const current = bars[index];
    let gap;
    if (current.low > first.high) {
      gap = { top: current.low, bottom: first.high, direction: BULLISH };
    } else if (current.high < first.low) {
      gap = { top: first.low, bottom: current.high, direction: BEARISH };
    }
    if (!gap || gap.top - gap.bottom < averageRange(bars, index) * 0.05) continue;

    let endIndex = Math.min(bars.length - 1, index + extendBars);
    for (let check = index + 1; check < bars.length; check += 1) {
      const filled = gap.direction === BULLISH
        ? bars[check].low <= gap.bottom
        : bars[check].high >= gap.top;
      if (filled) {
        endIndex = check;
        break;
      }
    }
    gaps.push({
      startTime: current.time,
      endTime: bars[endIndex].time,
      top: gap.top,
      bottom: gap.bottom,
      direction: gap.direction,
    });
  }
  return gaps.slice(-100);
}

function indiaDateParts(time) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time * 1000));
  return Object.fromEntries(values.map(({ type, value }) => [type, value]));
}

function periodKey(time, period) {
  const date = indiaDateParts(time);
  if (period === "day") return `${date.year}-${date.month}-${date.day}`;
  if (period === "month") return `${date.year}-${date.month}`;
  const utcDate = new Date(`${date.year}-${date.month}-${date.day}T00:00:00Z`);
  const day = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - day);
  return utcDate.toISOString().slice(0, 10);
}

function findPreviousPeriodLevels(bars, period) {
  const periods = [];
  for (const bar of bars) {
    const key = periodKey(bar.time, period);
    let current = periods.at(-1);
    if (!current || current.key !== key) {
      current = { key, startTime: bar.time, endTime: bar.time, high: bar.high, low: bar.low };
      periods.push(current);
    } else {
      current.endTime = bar.time;
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
    }
  }
  if (periods.length < 2) return [];
  const previous = periods.at(-2);
  const endTime = bars.at(-1).time;
  const prefix = period === "day" ? "D" : period === "week" ? "W" : "M";
  return [
    { startTime: previous.endTime, endTime, price: previous.high, label: `P${prefix}H`, direction: BEARISH },
    { startTime: previous.endTime, endTime, price: previous.low, label: `P${prefix}L`, direction: BULLISH },
  ];
}

function findPremiumDiscount(bars, swingPivots) {
  const highs = swingPivots.filter((pivot) => pivot.side === "high");
  const lows = swingPivots.filter((pivot) => pivot.side === "low");
  if (!highs.length || !lows.length || !bars.length) return [];
  const high = highs.at(-1);
  const low = lows.at(-1);
  const top = Math.max(high.price, low.price);
  const bottom = Math.min(high.price, low.price);
  const middle = (top + bottom) / 2;
  const range = top - bottom;
  if (!(range > 0)) return [];
  const startTime = Math.min(bars[high.index].time, bars[low.index].time);
  const endTime = bars.at(-1).time;
  return [
    { startTime, endTime, top, bottom: top - range * 0.05, label: "Premium", direction: BEARISH },
    { startTime, endTime, top: middle + range * 0.025, bottom: middle - range * 0.025, label: "Equilibrium", direction: 0 },
    { startTime, endTime, top: bottom + range * 0.05, bottom, label: "Discount", direction: BULLISH },
  ];
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

  const internalLength = options.internalLength ?? 5;
  const swingLength = options.swingLength ?? 50;
  const obCount = options.orderBlockCount ?? 5;
  const fvgExtension = options.fvgExtension ?? 1;
  const equalThreshold = options.equalThreshold ?? 0.1;
  for (const [name, value, minimum] of [
    ["Internal pivot length", internalLength, 1],
    ["Swing pivot length", swingLength, 2],
    ["Order block count", obCount, 1],
    ["FVG extension", fvgExtension, 0],
  ]) {
    if (!Number.isInteger(value) || value < minimum) {
      throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}`);
    }
  }
  if (!Number.isFinite(equalThreshold) || equalThreshold < 0 || equalThreshold > 0.5) {
    throw new RangeError("Equal-level threshold must be between 0 and 0.5");
  }

  const internalPivots = findPivots(bars, internalLength);
  const swingPivots = findPivots(bars, swingLength);
  const internal = findStructures(bars, internalPivots, internalLength, "internal");
  const swing = findStructures(bars, swingPivots, swingLength, "swing");
  const allEvents = [...internal.events, ...swing.events].sort((a, b) => a.index - b.index);

  return {
    internal,
    swing,
    orderBlocks: {
      internal: findOrderBlocks(bars, internal.events, obCount),
      swing: findOrderBlocks(bars, swing.events, obCount),
    },
    equalLevels: findEqualLevels(bars, [...internalPivots, ...swingPivots], equalThreshold),
    fairValueGaps: findFairValueGaps(bars, fvgExtension),
    premiumDiscount: findPremiumDiscount(bars, swingPivots),
    previousLevels: ["day", "week", "month"].flatMap((period) => findPreviousPeriodLevels(bars, period)),
    bias: allEvents.at(-1)?.direction ?? 0,
  };
}
