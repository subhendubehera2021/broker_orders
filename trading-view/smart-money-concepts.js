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
  let bias = 0;

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
        time: bars[index].time,
      });
      crossed.add(pivot);
      bias = direction;
    }
  }

  return { events, bias };
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

    let status = "fresh";
    let touchTime;
    let statusTime = bars[event.index].time;
    for (let index = event.index + 1; index < bars.length; index += 1) {
      const bar = bars[index];
      if (bar.high >= bottom && bar.low <= top) {
        status = "retested";
        touchTime = bar.time;
        statusTime = bar.time;
      }

      const invalidated = event.direction === BULLISH
        ? bar.close < bottom
        : bar.close > top;
      if (invalidated) {
        status = "invalidated";
        statusTime = bar.time;
        break;
      }

      const mitigated = event.direction === BULLISH
        ? bar.low < bottom
        : bar.high > top;
      if (mitigated) {
        status = "mitigated";
        statusTime = bar.time;
        break;
      }
    }

    blocks.push({
      startTime: bars[originIndex].time,
      createdTime: bars[event.index].time,
      endTime: bars.at(-1).time,
      touchTime,
      statusTime,
      status,
      top,
      bottom,
      direction: event.direction,
      kind: event.kind,
    });
  }

  return blocks.slice(-count);
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

  const internalPivotLength = options.internalPivotLength ?? 11;
  const swingPivotLength = options.swingPivotLength ?? 11;
  const orderBlockCount = options.orderBlockCount ?? DEFAULT_ORDER_BLOCK_COUNT;
  if (!Number.isInteger(internalPivotLength) || internalPivotLength < 2 || internalPivotLength > 50) {
    throw new RangeError("Internal pivot length must be an integer between 2 and 50");
  }
  if (!Number.isInteger(swingPivotLength) || swingPivotLength < 2 || swingPivotLength > 50) {
    throw new RangeError("Swing pivot length must be an integer between 2 and 50");
  }
  if (!Number.isInteger(orderBlockCount) || orderBlockCount < 1 || orderBlockCount > MAX_ORDER_BLOCK_COUNT) {
    throw new RangeError(`Order-block count must be an integer between 1 and ${MAX_ORDER_BLOCK_COUNT}`);
  }

  const internalPivots = findPivots(bars, internalPivotLength);
  const swingPivots = findPivots(bars, swingPivotLength);
  const internalEvents = findStructureEvents(bars, internalPivots, internalPivotLength, "internal");
  const swingEvents = findStructureEvents(bars, swingPivots, swingPivotLength, "swing");
  const { parsedHighs, parsedLows } = getParsedExtremes(bars);

  return {
    internal: internalEvents,
    swing: swingEvents,
    orderBlocks: {
      internal: findOrderBlocks(bars, internalEvents.events, orderBlockCount, parsedHighs, parsedLows),
      swing: findOrderBlocks(bars, swingEvents.events, orderBlockCount, parsedHighs, parsedLows),
    },
  };
}

export function evaluateOrderBlockSetup({
  swingBlocks,
  swingBias,
  internalEvents,
  candles,
}) {
  const empty = {
    state: "waiting",
    summary: "Waiting for swing context",
    direction: 0,
    block: undefined,
    checks: [],
    plan: undefined,
  };
  if (!Array.isArray(candles) || candles.length === 0) return empty;

  const latest = candles.at(-1);
  const orderedBlocks = [...(swingBlocks ?? [])].sort((a, b) => b.createdTime - a.createdTime);
  const matchingBlock = orderedBlocks.find((block) =>
    block.direction === swingBias && block.status !== "mitigated" && block.status !== "invalidated"
  );
  const block = matchingBlock ?? orderedBlocks[0];
  if (!block) {
    return {
      ...empty,
      summary: swingBias ? "Waiting for a swing order block" : "Waiting for swing structure",
      checks: [
        { label: "Swing bias", state: swingBias ? "pass" : "wait", detail: describeBias(swingBias) },
        { label: "Swing order block", state: "wait", detail: "No confirmed swing block in the loaded data" },
      ],
    };
  }

  let status = block.status;
  let touchTime = block.touchTime;
  let visibleRetest = false;
  let liveStatusTime = block.statusTime;
  const history = candles.filter((bar) => bar.time > block.createdTime);
  for (const bar of history) {
    const touched = bar.high >= block.bottom && bar.low <= block.top;
    if (touched && status !== "invalidated" && status !== "mitigated") {
      status = "retested";
      touchTime = bar.time;
      visibleRetest = true;
      liveStatusTime = bar.time;
    }

    if (status === "invalidated" || status === "mitigated") continue;
    const invalidated = block.direction === BULLISH
      ? bar.close < block.bottom
      : bar.close > block.top;
    if (invalidated) {
      status = "invalidated";
      liveStatusTime = bar.time;
      continue;
    }
    const mitigated = block.direction === BULLISH
      ? bar.low < block.bottom
      : bar.high > block.top;
    if (mitigated) {
      status = "mitigated";
      liveStatusTime = bar.time;
    }
  }

  const priceInZone = latest.high >= block.bottom && latest.low <= block.top;
  if (latest.time > block.createdTime && priceInZone && status === "fresh") {
    status = "retested";
    touchTime = latest.time;
    liveStatusTime = latest.time;
    visibleRetest = true;
  }
  const retestIndex = touchTime === undefined
    ? -1
    : candles.findIndex((bar) => bar.time === touchTime);
  const retestInHistory = visibleRetest && retestIndex >= 0;
  const confirmation = (internalEvents ?? []).findLast((event) =>
    event.direction === block.direction &&
    event.time > touchTime &&
    event.time < latest.time
  );
  const biasAligned = swingBias === block.direction;
  const zoneActive = status !== "invalidated" && status !== "mitigated";
  const confirmationAfterRetest = Boolean(confirmation);
  const plan = buildReferencePlan(block, latest.close, swingBlocks ?? []);
  const checks = [
    { label: "Swing bias", state: biasAligned ? "pass" : "wait", detail: describeBias(swingBias) },
    {
      label: "Swing zone",
      state: zoneActive ? status === "retested" ? "pass" : "wait" : "fail",
      detail: describeZone(block.direction, status),
    },
    {
      label: "Retest in chart history",
      state: retestInHistory ? "pass" : "wait",
      detail: retestInHistory
        ? "Retest found in the selected chart history"
        : "Wait for price to revisit the zone",
    },
    {
      label: "Internal confirmation",
      state: confirmationAfterRetest ? "pass" : "wait",
      detail: confirmation
        ? `${confirmation.direction === BULLISH ? "Bullish" : "Bearish"} structure break`
        : "Wait for a same-direction internal break after the retest",
    },
    {
      label: "Risk/target references",
      state: plan.riskReward === undefined ? "wait" : "pass",
      detail: plan.riskReward === undefined
        ? "No valid opposing-zone target in the loaded data"
        : `Reference R:R ${plan.riskReward.toFixed(2)}; apply your own risk rules`,
    },
  ];
  const conditionsMet = checks.every((check) => check.state === "pass");
  const state = !zoneActive
    ? "invalid"
    : conditionsMet
      ? "review"
      : "waiting";

  return {
    state,
    summary: status === "invalidated"
      ? "Zone invalidated · wait for a new setup"
      : status === "mitigated"
        ? "Zone mitigated · wait for a new setup"
      : conditionsMet
        ? "Conditions met · review manually"
        : "Waiting · checklist incomplete",
    direction: block.direction,
    block: { ...block, status, touchTime, statusTime: liveStatusTime },
    checks,
    plan,
  };
}

function describeBias(bias) {
  if (bias === BULLISH) return "Bullish swing structure";
  if (bias === BEARISH) return "Bearish swing structure";
  return "No confirmed swing direction";
}

function describeZone(direction, status) {
  const label = direction === BULLISH ? "Bullish demand" : "Bearish supply";
  if (status === "invalidated") return `${label} zone invalidated`;
  if (status === "mitigated") return `${label} zone mitigated`;
  if (status === "retested") return `${label} zone retested`;
  return `${label} zone is fresh`;
}

function buildReferencePlan(block, entry, swingBlocks) {
  const stop = block.direction === BULLISH ? block.bottom : block.top;
  const opposingBlocks = swingBlocks.filter((candidate) =>
    candidate.direction !== block.direction &&
    candidate.status !== "mitigated" &&
    candidate.status !== "invalidated"
  );
  const targetBlock = block.direction === BULLISH
    ? opposingBlocks
      .filter((candidate) => candidate.bottom > entry)
      .sort((a, b) => a.bottom - b.bottom)[0]
    : opposingBlocks
      .filter((candidate) => candidate.top < entry)
      .sort((a, b) => b.top - a.top)[0];
  const target = targetBlock
    ? block.direction === BULLISH ? targetBlock.bottom : targetBlock.top
    : undefined;
  const risk = Math.abs(entry - stop);
  const reward = target === undefined
    ? undefined
    : block.direction === BULLISH ? target - entry : entry - target;
  return {
    entry,
    stop,
    target,
    riskReward: risk > 0 && reward > 0 ? reward / risk : undefined,
  };
}
