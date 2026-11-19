import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDemoPnl,
  DEMO_LOT_SIZE,
  demoFillPrice,
  isDemoOrderTriggered,
} from "../trading-view/demo-trading.js";

test("demo stop and limit orders fill on touch or a gap of at least ten paise", () => {
  assert.equal(isDemoOrderTriggered({ side: "buy", type: "Stop", price: 100 }, 100), true);
  assert.equal(isDemoOrderTriggered({ side: "buy", type: "Stop", price: 100 }, 100.05), false);
  assert.equal(isDemoOrderTriggered({ side: "buy", type: "Stop", price: 100 }, 100.1), true);

  assert.equal(isDemoOrderTriggered({ side: "buy", type: "Limit", price: 100 }, 100), true);
  assert.equal(isDemoOrderTriggered({ side: "buy", type: "Limit", price: 100 }, 99.95), false);
  assert.equal(isDemoOrderTriggered({ side: "buy", type: "Limit", price: 100 }, 99.9), true);

  assert.equal(isDemoOrderTriggered({ side: "sell", type: "Limit", price: 100 }, 100), true);
  assert.equal(isDemoOrderTriggered({ side: "sell", type: "Limit", price: 100 }, 100.1), true);
  assert.equal(isDemoOrderTriggered({ side: "sell", type: "Stop", price: 100 }, 101), false);
});

test("demo fills use marketable prices and P/L uses one 65-unit lot", () => {
  assert.equal(demoFillPrice({ side: "buy", type: "Limit", price: 100 }, 99.9), 99.9);
  assert.equal(demoFillPrice({ side: "sell", type: "Limit", price: 100 }, 100.1), 100.1);
  assert.equal(demoFillPrice({ side: "buy", type: "Stop", price: 100 }, 100.1), 100.1);
  assert.equal(calculateDemoPnl("buy", 100, 102), 2 * DEMO_LOT_SIZE);
  assert.equal(calculateDemoPnl("sell", 100, 102), -2 * DEMO_LOT_SIZE);
  assert.equal(calculateDemoPnl("buy", 100, 102, 10), 20);
});
