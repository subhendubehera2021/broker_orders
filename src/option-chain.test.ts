import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectNearbyNiftyOptionContracts,
  type NiftyOptionContract,
} from "./option-chain.js";

function contractsAt(...strikes: number[]): NiftyOptionContract[] {
  return strikes.flatMap((strike) => [
    {
      instrumentToken: `${strike}C`,
      tradingSymbol: `NIFTY-${strike}-CE`,
      optionType: "CE" as const,
      strike,
      expiry: "03NOV2026",
      lotSize: "65",
    },
    {
      instrumentToken: `${strike}P`,
      tradingSymbol: `NIFTY-${strike}-PE`,
      optionType: "PE" as const,
      strike,
      expiry: "03NOV2026",
      lotSize: "65",
    },
  ]);
}

describe("selectNearbyNiftyOptionContracts", () => {
  it("selects the three closest paired strikes below and above the live price", () => {
    const contracts = contractsAt(100, 150, 200, 250, 300, 350, 400, 450, 500);

    const selected = selectNearbyNiftyOptionContracts(contracts, 310);

    assert.deepEqual(
      [...new Set(selected.map(({ strike }) => strike))].sort((a, b) => a - b),
      [200, 250, 300, 350, 400, 450],
    );
    assert.equal(selected.length, 12);
    for (const strike of [200, 250, 300, 350, 400, 450]) {
      assert.deepEqual(
        selected.filter((contract) => contract.strike === strike).map(({ optionType }) => optionType).sort(),
        ["CE", "PE"],
      );
    }
  });

  it("omits a strike without both a call and a put contract", () => {
    const contracts = contractsAt(100, 200, 300, 400, 500, 600, 700).filter(
      ({ instrumentToken }) => instrumentToken !== "300P",
    );

    const selected = selectNearbyNiftyOptionContracts(contracts, 350);

    assert.deepEqual(
      [...new Set(selected.map(({ strike }) => strike))].sort((a, b) => a - b),
      [100, 200, 400, 500, 600],
    );
  });
});
