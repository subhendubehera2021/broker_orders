import assert from "node:assert/strict";
import test from "node:test";
import { getHighestVolumeOptions } from "../src/internal/services/highest-volume-options.service.js";

function makeOptionChain(optionsChain) {
  return {
    callOi: 1000,
    putOi: 2000,
    expiryData: [],
    indiavixData: {
      symbol: "NSE:INDIAVIX-INDEX",
      option_type: "",
      strike_price: -1,
    },
    optionsChain,
  };
}

test("selects the highest-volume CE and PE inside the inclusive LTP bounds", async () => {
  const optionChainQuery = {
    symbol: "NSE:NIFTY50-INDEX",
    strikecount: 1,
    greeks: 0,
    timestamp: "",
  };
  let receivedQuery;
  const result = await getHighestVolumeOptions(
    optionChainQuery,
    { ltpMin: 100, ltpMax: 200 },
    async (query) => {
      receivedQuery = query;
      return {
        data: makeOptionChain([
          { symbol: "NSE:NIFTY50-INDEX", option_type: "", strike_price: -1, ltp: 150, volume: 9999 },
          { symbol: "NSE:NIFTYCE-OUT", option_type: "CE", strike_price: 26000, ltp: 99, volume: 5000 },
          { symbol: "NSE:NIFTYCE-IN", option_type: "CE", strike_price: 26000, ltp: 100, volume: 500 },
          { symbol: "NSE:NIFTYCE-BEST", option_type: "CE", strike_price: 26050, ltp: 150, volume: 800 },
          { symbol: "NSE:NIFTYCE-OVER", option_type: "CE", strike_price: 26100, ltp: 201, volume: 9000 },
          { symbol: "NSE:NIFTYPE-BEST", option_type: "PE", strike_price: 25950, ltp: 120, volume: 900 },
          { symbol: "NSE:NIFTYPE-IN", option_type: "PE", strike_price: 25900, ltp: 200, volume: 700 },
        ]),
      };
    },
  );

  assert.equal(receivedQuery, optionChainQuery);
  assert.equal(result.symbol, optionChainQuery.symbol);
  assert.equal(result.highestVolume.CE.symbol, "NSE:NIFTYCE-BEST");
  assert.equal(result.highestVolume.PE.symbol, "NSE:NIFTYPE-BEST");
  assert.deepEqual(
    Object.values(result.highestVolume).map(({ option_type }) => option_type).sort(),
    ["CE", "PE"],
  );
});

test("returns null when no contract of a side matches the LTP range", async () => {
  const result = await getHighestVolumeOptions(
    { symbol: "NSE:NIFTY50-INDEX" },
    { ltpMin: 100, ltpMax: 200 },
    async () => ({
      data: makeOptionChain([
        { symbol: "NSE:NIFTYCE", option_type: "CE", strike_price: 26000, ltp: 150, volume: 100 },
      ]),
    }),
  );

  assert.equal(result.highestVolume.CE.symbol, "NSE:NIFTYCE");
  assert.equal(result.highestVolume.PE, null);
});

test("selects the highest-volume contracts without LTP bounds", async () => {
  const result = await getHighestVolumeOptions(
    { symbol: "NSE:NIFTY50-INDEX" },
    { ltpMin: null, ltpMax: null },
    async () => ({
      data: makeOptionChain([
        { symbol: "NSE:NIFTY50-INDEX", option_type: "", strike_price: -1, ltp: 150, volume: 9999 },
        { symbol: "NSE:NIFTYCE-LOW", option_type: "CE", strike_price: 26000, ltp: 50, volume: 300 },
        { symbol: "NSE:NIFTYCE-HIGH", option_type: "CE", strike_price: 26100, ltp: 500, volume: 800 },
        { symbol: "NSE:NIFTYPE-HIGH", option_type: "PE", strike_price: 25900, ltp: 650, volume: 900 },
      ]),
    }),
  );

  assert.equal(result.highestVolume.CE.symbol, "NSE:NIFTYCE-HIGH");
  assert.equal(result.highestVolume.PE.symbol, "NSE:NIFTYPE-HIGH");
});
