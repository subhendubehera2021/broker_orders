import assert from "node:assert/strict";
import test from "node:test";
import { parseFyersLiveTick } from "../src/fyers/lib/live-candles.js";
import { createLiveCandleAggregator } from "../public/ui/live-candles.js";

test("parses Fyers live price, timestamp, and cumulative volume", () => {
  assert.deepEqual(parseFyersLiveTick({
    symbol: "NSE:NIFTY50-INDEX",
    ltp: 25001.5,
    exch_feed_time: 1795760100,
    vol_traded_today: 12345,
  }), {
    symbol: "NSE:NIFTY50-INDEX",
    price: 25001.5,
    time: 1795760100,
    cumulativeVolume: 12345,
  });
});

test("normalizes millisecond timestamps and ignores non-price messages", () => {
  assert.equal(parseFyersLiveTick({
    symbol: "NSE:SBIN-EQ",
    lp: "500.25",
    timestamp: 1795760100000,
  }).time, 1795760100);
  assert.equal(parseFyersLiveTick({ type: "connection" }), null);
});

test("aggregates ticks into interval candles with incremental volume", () => {
  const aggregator = createLiveCandleAggregator(
    3,
    { time: 540, open: 100, high: 102, low: 99, close: 101, volume: 500 },
    10000,
  );

  assert.deepEqual(aggregator.update({
    time: 660,
    price: 103,
    cumulativeVolume: 10030,
  }), {
    candle: { time: 540, open: 100, high: 103, low: 99, close: 103, volume: 530 },
    isNewBar: false,
  });

  assert.deepEqual(aggregator.update({
    time: 720,
    price: 98,
    cumulativeVolume: 10050,
  }), {
    candle: { time: 720, open: 98, high: 98, low: 98, close: 98, volume: 20 },
    isNewBar: true,
  });
});

test("rejects unsupported live candle intervals", () => {
  assert.throws(() => createLiveCandleAggregator(2), RangeError);
});
