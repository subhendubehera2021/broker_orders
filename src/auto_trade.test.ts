import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeLiquiditySwings, type LiquidityBar } from "./auto_trade/index.js";

function barsFrom(highs: number[], lows: number[]): LiquidityBar[] {
  return highs.map((high, index) => ({
    open: (high + lows[index]!) / 2,
    high,
    low: lows[index]!,
    close: (high + lows[index]!) / 2,
    volume: 10,
  }));
}

describe("analyzeLiquiditySwings", () => {
  it("confirms a pivot after the lookback and tracks intersection and break events", () => {
    const bars = barsFrom([2, 3, 5, 4, 3, 2], [0, 1, 2, 1, 0, -1]);
    bars[5]!.high = 6;
    bars[5]!.close = 5.5;

    const result = analyzeLiquiditySwings(bars, { pivotLookback: 1 });

    assert.equal(result.highSwings.length, 1);
    assert.equal(result.highSwings[0]!.pivotIndex, 2);
    assert.equal(result.highSwings[0]!.confirmedAt, 3);
    assert.equal(result.highSwings[0]!.intersectionCount, 1);
    assert.equal(result.highSwings[0]!.qualifiedAt, 4);
    assert.equal(result.highSwings[0]!.crossedAt, 5);
    assert.deepEqual(
      result.events.map(({ type, index }) => [type, index]),
      [
        ["pivot", 3],
        ["qualified", 4],
        ["crossed", 5],
      ],
    );
  });

  it("uses supplied intrabar candles to calculate volume intersections", () => {
    const bars = barsFrom([2, 4, 8, 4, 3], [0, 1, 3, 1, 0]);
    bars[2]!.open = 3.5;
    bars[2]!.close = 3.5;
    bars[3]!.intrabars = [
      { open: 2, high: 3, low: 1, close: 2, volume: 4 },
      { open: 3, high: 4, low: 2, close: 3, volume: 7 },
    ];

    const result = analyzeLiquiditySwings(bars, {
      pivotLookback: 1,
      filterBy: "volume",
      useIntrabarVolume: true,
    });

    assert.equal(result.highSwings[0]!.intersectionCount, 1);
    assert.equal(result.highSwings[0]!.intersectionVolume, 7);
    assert.equal(result.highSwings[0]!.qualifiedAt, 4);
  });

  it("rejects invalid lookbacks and malformed market bars", () => {
    assert.throws(() => analyzeLiquiditySwings([], { pivotLookback: 0 }), RangeError);
    assert.throws(
      () => analyzeLiquiditySwings([{ open: 2, high: 1, low: 0, close: 1, volume: 1 }]),
      RangeError,
    );
  });
});
