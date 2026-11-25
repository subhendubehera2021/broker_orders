import assert from "node:assert/strict";
import test from "node:test";
import { parseOptionChainModel } from "../src/fyers/models/option-chain.model.js";

test("accepts and preserves the Fyers option-chain response structure", () => {
  const data = {
    callOi: 100,
    putOi: 120,
    expiryData: [{ date: "01-12-2026", expiry: "1796119800", expiry_flag: "W" }],
    indiavixData: {
      symbol: "NSE:INDIAVIX-INDEX",
      option_type: "",
      strike_price: -1,
    },
    optionsChain: [
      { symbol: "NSE:NIFTY50-INDEX", option_type: "", strike_price: -1 },
      {
        symbol: "NSE:NIFTY26D0125750PE",
        option_type: "PE",
        strike_price: 25750,
        greeks: { delta: -0.44, gamma: 0.0007, theta: -17.94, vega: 13.07, iv: 16.49 },
      },
    ],
  };

  assert.equal(parseOptionChainModel(data), data);
});

test("rejects malformed option-chain instrument data", () => {
  assert.throws(
    () => parseOptionChainModel({
      callOi: 100,
      putOi: 120,
      expiryData: [],
      indiavixData: {},
      optionsChain: [],
    }),
    /invalid option-chain response/,
  );
});
