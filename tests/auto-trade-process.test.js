import assert from "node:assert/strict";
import test from "node:test";
import { getAutoTradeProcessData } from "../src/auto-trade-process/services/auto-trade-process.service.js";
import { processSelectedOptions } from "../src/auto-trade-process/services/step-two.service.js";

test("forwards the supplied option-chain and LTP settings", async () => {
  let received;
  const responseData = {
    symbol: "NSE:NIFTY50-INDEX",
    ltpRange: { ltpMin: 100, ltpMax: 140 },
    highestVolume: {
      CE: {
        option_type: "CE",
        symbol: "NSE:NIFTYCE",
        ltp: 120,
        volume: 2400,
      },
      PE: {
        option_type: "PE",
        symbol: "NSE:NIFTYPE",
        ltp: 130,
        volume: 1800,
      },
    },
  };
  const optionChainQuery = {
    symbol: "NSE:NIFTY50-INDEX",
    strikecount: 50,
    greeks: 0,
    timestamp: "",
  };
  const ltpRange = { ltpMin: 100, ltpMax: 140 };
  const stepTwoResult = {
    selectedCount: 0,
    totalVolume: 0,
    contracts: [],
  };
  const persistenceResult = { inserted: 0, unchanged: 0 };

  const result = await getAutoTradeProcessData(
    optionChainQuery,
    ltpRange,
    {
      getHighestVolumeOptionsImpl: async (query, range) => {
        received = { query, range };
        return responseData;
      },
      processSelectedOptionsImpl: async (highestVolume, options) => {
        assert.equal(highestVolume, responseData.highestVolume);
        assert.deepEqual(options, {
          swingConfigs: [{ resolution: "1", pivotLookback: 5 }],
        });
        return stepTwoResult;
      },
      saveChangedLiquiditySwingsImpl: async (step2) => {
        assert.equal(step2, stepTwoResult);
        return persistenceResult;
      },
    },
  );

  assert.deepEqual(received, {
    query: optionChainQuery,
    range: ltpRange,
  });
  assert.deepEqual(result, {
    ...responseData,
    step2: { ...stepTwoResult, persistence: persistenceResult },
  });
});

test("step 2 fetches swings for each selected option symbol", async () => {
  const calls = [];
  const dateRange = { fromDate: "2026-11-22", toDate: "2026-11-25" };
  const minuteBars = Array.from({ length: 6 }, (_value, index) => {
    const open = index + 10;
    return {
      timestamp: new Date(Date.UTC(2026, 10, 25, 3, 45 + index)).toISOString(),
      open,
      high: open + 2,
      low: open - 2,
      close: open + 1,
      volume: 100 + index,
    };
  });
  const result = await processSelectedOptions(
    {
      CE: {
        option_type: "CE",
        symbol: "NSE:NIFTYCE",
        ltp: 120,
        volume: 2400,
      },
      PE: {
        option_type: "PE",
        symbol: "NSE:NIFTYPE",
        ltp: 130,
        volume: 1800,
      },
    },
    {
      swingConfigs: [
        { resolution: "1", pivotLookback: 5 },
        { resolution: "1", pivotLookback: 7 },
        { resolution: "1", pivotLookback: 14 },
        { resolution: "3", pivotLookback: 5 },
        { resolution: "3", pivotLookback: 7 },
        { resolution: "3", pivotLookback: 14 },
      ],
      dateRange,
      fetchHistoricalBarsImpl: async (symbol, options) => {
        calls.push({ symbol, options });
        assert.equal(options.resolution, "1");
        return minuteBars;
      },
    },
  );

  assert.deepEqual(calls.map(({ symbol }) => symbol).sort(), ["NSE:NIFTYCE", "NSE:NIFTYPE"]);
  assert.ok(calls.every(({ options }) => (
    options.fromDate === dateRange.fromDate && options.toDate === dateRange.toDate
  )));
  assert.deepEqual(
    result.contracts[0].liquiditySwings.configurations.map(
      ({ resolution, pivotLookback, source, barsAnalyzed }) => ({
        resolution,
        pivotLookback,
        source,
        barsAnalyzed,
      }),
    ),
    [
      { resolution: "1", pivotLookback: 5, source: "fyers", barsAnalyzed: 6 },
      { resolution: "1", pivotLookback: 7, source: "fyers", barsAnalyzed: 6 },
      { resolution: "1", pivotLookback: 14, source: "fyers", barsAnalyzed: 6 },
      { resolution: "3", pivotLookback: 5, source: "aggregated-from-1-minute", barsAnalyzed: 2 },
      { resolution: "3", pivotLookback: 7, source: "aggregated-from-1-minute", barsAnalyzed: 2 },
      { resolution: "3", pivotLookback: 14, source: "aggregated-from-1-minute", barsAnalyzed: 2 },
    ],
  );
  assert.equal(result.selectedCount, 2);
  assert.equal(result.totalVolume, 4200);
  assert.deepEqual(
    result.contracts.map(({ option_type, symbol }) => ({ option_type, symbol })),
    [
      { option_type: "CE", symbol: "NSE:NIFTYCE" },
      { option_type: "PE", symbol: "NSE:NIFTYPE" },
    ],
  );
  assert.ok(result.contracts.every(({ liquiditySwings }) => (
    liquiditySwings.fromDate === dateRange.fromDate &&
    liquiditySwings.toDate === dateRange.toDate &&
    liquiditySwings.configurations.length === 6
  )));
});

test("step 2 returns an empty summary when no option matched", async () => {
  let fetchCalled = false;
  const result = await processSelectedOptions(
    { CE: null, PE: null },
    {
      fetchHistoricalBarsImpl: async () => {
        fetchCalled = true;
        throw new Error("Should not fetch without a selected option.");
      },
    },
  );

  assert.equal(fetchCalled, false);
  assert.deepEqual(result, {
    selectedCount: 0,
    totalVolume: 0,
    contracts: [],
  });
});
