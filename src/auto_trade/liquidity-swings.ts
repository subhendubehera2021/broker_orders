/*
 * Adapted from Liquidity Swings [LuxAlgo], © LuxAlgo.
 * Licensed under CC BY-NC-SA 4.0:
 * https://creativecommons.org/licenses/by-nc-sa/4.0/
 * This adaptation is subject to the same license and noncommercial restriction.
 */

export interface PriceBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LiquidityBar extends PriceBar {
  intrabars?: readonly PriceBar[];
}

export type SwingSide = "high" | "low";
export type SwingAreaMode = "wick-extremity" | "full-range";
export type SwingFilter = "count" | "volume";

export interface LiquiditySwingOptions {
  pivotLookback?: number;
  areaMode?: SwingAreaMode;
  filterBy?: SwingFilter;
  filterValue?: number;
  useIntrabarVolume?: boolean;
}

export interface LiquiditySwing {
  side: SwingSide;
  pivotIndex: number;
  confirmedAt: number;
  level: number;
  zoneTop: number;
  zoneBottom: number;
  intersectionCount: number;
  intersectionVolume: number;
  qualifiedAt?: number;
  crossedAt?: number;
}

export interface LiquiditySwingEvent {
  index: number;
  type: "pivot" | "qualified" | "crossed";
  swing: LiquiditySwing;
}

export interface LiquiditySwingAnalysis {
  highSwings: LiquiditySwing[];
  lowSwings: LiquiditySwing[];
  events: LiquiditySwingEvent[];
}

const DEFAULT_OPTIONS: Required<LiquiditySwingOptions> = {
  pivotLookback: 14,
  areaMode: "wick-extremity",
  filterBy: "count",
  filterValue: 0,
  useIntrabarVolume: false,
};

/**
 * Finds confirmed swing pivots and tracks intersection count/volume and close
 * breaks for each swing area. The input bars must be ordered oldest to newest.
 */
export function analyzeLiquiditySwings(
  bars: readonly LiquidityBar[],
  options: LiquiditySwingOptions = {},
): LiquiditySwingAnalysis {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  validateOptions(settings);
  validateBars(bars);

  const highSwings: LiquiditySwing[] = [];
  const lowSwings: LiquiditySwing[] = [];
  const events: LiquiditySwingEvent[] = [];
  let activeHigh: LiquiditySwing | undefined;
  let activeLow: LiquiditySwing | undefined;

  for (let index = 0; index < bars.length; index += 1) {
    const pivotIndex = index - settings.pivotLookback;
    const hasPivotWindow = pivotIndex >= settings.pivotLookback;
    const isHighPivot =
      hasPivotWindow && isPivot(bars, pivotIndex, settings.pivotLookback, "high");
    const isLowPivot =
      hasPivotWindow && isPivot(bars, pivotIndex, settings.pivotLookback, "low");

    if (isHighPivot) {
      const bar = bars[pivotIndex]!;
      const zoneBottom =
        settings.areaMode === "wick-extremity"
          ? Math.max(bar.open, bar.close)
          : bar.low;
      activeHigh = {
        side: "high",
        pivotIndex,
        confirmedAt: index,
        level: bar.high,
        zoneTop: bar.high,
        zoneBottom,
        intersectionCount: 0,
        intersectionVolume: 0,
      };
      highSwings.push(activeHigh);
      addEvent(events, index, "pivot", activeHigh);
    } else if (activeHigh) {
      updateSwing(activeHigh, bars[pivotIndex], bars[index]!, index, settings, events);
    }

    if (isLowPivot) {
      const bar = bars[pivotIndex]!;
      const zoneTop =
        settings.areaMode === "wick-extremity"
          ? Math.min(bar.open, bar.close)
          : bar.high;
      activeLow = {
        side: "low",
        pivotIndex,
        confirmedAt: index,
        level: bar.low,
        zoneTop,
        zoneBottom: bar.low,
        intersectionCount: 0,
        intersectionVolume: 0,
      };
      lowSwings.push(activeLow);
      addEvent(events, index, "pivot", activeLow);
    } else if (activeLow) {
      updateSwing(activeLow, bars[pivotIndex], bars[index]!, index, settings, events);
    }
  }

  return {
    highSwings: highSwings.map(copySwing),
    lowSwings: lowSwings.map(copySwing),
    events,
  };
}

function isPivot(
  bars: readonly LiquidityBar[],
  pivotIndex: number,
  lookback: number,
  side: SwingSide,
): boolean {
  const level = side === "high" ? bars[pivotIndex]!.high : bars[pivotIndex]!.low;
  for (let offset = 1; offset <= lookback; offset += 1) {
    const older = bars[pivotIndex - offset]!;
    const newer = bars[pivotIndex + offset]!;
    if (side === "high") {
      if (level < older.high || level <= newer.high) return false;
    } else if (level > older.low || level >= newer.low) {
      return false;
    }
  }
  return true;
}

function updateSwing(
  swing: LiquiditySwing,
  candidateBar: LiquidityBar | undefined,
  currentBar: LiquidityBar,
  index: number,
  options: Required<LiquiditySwingOptions>,
  events: LiquiditySwingEvent[],
): void {
  if (
    candidateBar &&
    intersects(candidateBar.low, candidateBar.high, swing.zoneTop, swing.zoneBottom)
  ) {
    swing.intersectionCount += 1;
    if (options.useIntrabarVolume) {
      swing.intersectionVolume += (candidateBar.intrabars ?? [])
        .filter((bar) => intersects(bar.low, bar.high, swing.zoneTop, swing.zoneBottom))
        .reduce((total, bar) => total + bar.volume, 0);
    } else {
      swing.intersectionVolume += candidateBar.volume;
    }
  }

  const target =
    options.filterBy === "count" ? swing.intersectionCount : swing.intersectionVolume;
  if (swing.qualifiedAt === undefined && target > options.filterValue) {
    swing.qualifiedAt = index;
    addEvent(events, index, "qualified", swing);
  }

  const crossed =
    swing.side === "high"
      ? currentBar.close > swing.zoneTop
      : currentBar.close < swing.zoneBottom;
  if (crossed && swing.crossedAt === undefined) {
    swing.crossedAt = index;
    addEvent(events, index, "crossed", swing);
  }
}

function intersects(low: number, high: number, zoneTop: number, zoneBottom: number): boolean {
  return low < zoneTop && high > zoneBottom;
}

function addEvent(
  events: LiquiditySwingEvent[],
  index: number,
  type: LiquiditySwingEvent["type"],
  swing: LiquiditySwing,
): void {
  events.push({ index, type, swing: copySwing(swing) });
}

function copySwing(swing: LiquiditySwing): LiquiditySwing {
  return { ...swing };
}

function validateOptions(options: Required<LiquiditySwingOptions>): void {
  if (!Number.isInteger(options.pivotLookback) || options.pivotLookback < 1) {
    throw new RangeError("pivotLookback must be a positive integer");
  }
  if (options.areaMode !== "wick-extremity" && options.areaMode !== "full-range") {
    throw new RangeError("areaMode must be 'wick-extremity' or 'full-range'");
  }
  if (options.filterBy !== "count" && options.filterBy !== "volume") {
    throw new RangeError("filterBy must be 'count' or 'volume'");
  }
  if (!Number.isFinite(options.filterValue) || options.filterValue < 0) {
    throw new RangeError("filterValue must be a non-negative finite number");
  }
}

function validateBars(bars: readonly LiquidityBar[]): void {
  bars.forEach((bar, index) => {
    validatePriceBar(bar, `bars[${index}]`);
    bar.intrabars?.forEach((intrabar, intrabarIndex) => {
      validatePriceBar(intrabar, `bars[${index}].intrabars[${intrabarIndex}]`);
    });
  });
}

function validatePriceBar(bar: PriceBar, label: string): void {
  const values = [bar.open, bar.high, bar.low, bar.close, bar.volume];
  if (!values.every(Number.isFinite)) {
    throw new RangeError(`${label} must contain finite OHLCV values`);
  }
  if (
    bar.low > bar.high ||
    bar.low > Math.min(bar.open, bar.close) ||
    bar.high < Math.max(bar.open, bar.close) ||
    bar.volume < 0
  ) {
    throw new RangeError(`${label} must have valid OHLC values and non-negative volume`);
  }
}
