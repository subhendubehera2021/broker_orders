import assert from "node:assert/strict";
import test from "node:test";
import { getAutoTradeProcessData } from "../src/auto-trade-process/services/auto-trade-process.service.js";

test("forwards the supplied option-chain and LTP settings", async () => {
  let received;
  const responseData = { highestVolume: { CE: null, PE: null } };
  const optionChainQuery = {
    symbol: "NSE:NIFTY50-INDEX",
    strikecount: 50,
    greeks: 0,
    timestamp: "",
  };
  const ltpRange = { ltpMin: 100, ltpMax: 140 };

  const result = await getAutoTradeProcessData(optionChainQuery, ltpRange, async (query, range) => {
    received = { query, range };
    return responseData;
  });

  assert.deepEqual(received, {
    query: optionChainQuery,
    range: ltpRange,
  });
  assert.equal(result, responseData);
});
