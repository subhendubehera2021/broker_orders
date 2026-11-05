import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterUpcomingExpiryLabels,
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

  describe("filterUpcomingExpiryLabels", () => {
    it("excludes past expiries and keeps today and future dates in India time", () => {
      const now = new Date("2026-11-05T05:30:00.000Z");
      const expiries = ["04NOV2026", "05NOV2026", "06NOV2026", "31FEB2027"];

      assert.deepEqual(filterUpcomingExpiryLabels(expiries, now), ["05NOV2026", "06NOV2026"]);
    });

    it("uses the current date in Asia/Kolkata near a UTC date boundary", () => {
      const now = new Date("2026-11-04T20:00:00.000Z");

      assert.deepEqual(filterUpcomingExpiryLabels(["04NOV2026", "05NOV2026"], now), ["05NOV2026"]);
    });
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
