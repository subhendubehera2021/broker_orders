import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchLiquiditySwings,
  findLatestLiquiditySwings,
  recentIndiaDateRange,
} from "../src/liquidity-swing/index.js";

function makeBars(highs, lows) {
  return highs.map((high, index) => {
    const low = lows[index];
    const price = (high + low) / 2;
    return {
      timestamp: new Date(Date.UTC(2026, 10, 16, 3, index)).toISOString(),
      open: price,
      high,
      low,
      close: price,
      volume: 100 + index,
    };
  });
}

test("finds the latest confirmed liquidity high and low with their zones", () => {
  const bars = makeBars(
    [2, 3, 7, 5, 4, 3, 2, 3, 4],
    [0, -1, 1, 2, -2, 0, 1, -1, 0],
  );

  const result = findLatestLiquiditySwings(bars, { pivotLookback: 2 });

  assert.equal(result.high.pivotTime, bars[2].timestamp);
  assert.equal(result.high.confirmedAt, bars[4].timestamp);
  assert.equal(result.high.level, 7);
  assert.equal(result.high.zoneBottom, 4);
  assert.equal(result.low.pivotTime, bars[4].timestamp);
  assert.equal(result.low.confirmedAt, bars[6].timestamp);
  assert.equal(result.low.level, -2);
  assert.equal(result.low.intersectionCount, 2);
  assert.equal(result.low.status, "qualified");
});

test("requests and parses historical candles for an option token", async () => {
  let requestUrl;
  const bars = makeBars(
    [2, 3, 7, 5, 4, 3, 2, 3, 4],
    [0, -1, 1, 2, -2, 0, 1, -1, 0],
  );
  const result = await fetchLiquiditySwings(
    { token: "nse_fo|123", symbol: "NIFTY-OPTION" },
    {
      apiToken: "dashboard-token",
      baseUrl: "https://cis.kotaksecurities.com",
      fromDate: "2026-11-13",
      toDate: "2026-11-16",
      pivotLookback: 2,
    },
    async (url, options) => {
      requestUrl = url;
      assert.equal(options.headers.Authorization, "dashboard-token");
      return Response.json({
        status: "success",
        data: {
          candles: bars.map(({ timestamp, open, high, low, close, volume }) => [
            timestamp,
            open,
            high,
            low,
            close,
            volume,
          ]),
        },
      });
    },
  );

  assert.equal(
    requestUrl.href,
    "https://cis.kotaksecurities.com/market-data/1.0/historical/details?neosymbol=nse_fo%7C123&fromdate=2026-11-13&todate=2026-11-16&interval=1min",
  );
  assert.equal(result.bars.length, bars.length);
  assert.equal(result.swings.high.level, 7);
  assert.equal(result.swings.low.level, -2);
  assert.equal(result.interval, "1min");
  assert.equal(result.pivotLookback, 2);
});

test("builds a recent date range using the India calendar date", () => {
  assert.deepEqual(
    recentIndiaDateRange(new Date("2026-11-16T18:45:00.000Z"), 3),
    { fromDate: "2026-11-14", toDate: "2026-11-17" },
  );
});
