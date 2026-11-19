export const DEMO_LOT_SIZE = 65;

const touchTolerance = 0.01;
const gapThreshold = 0.1;

export function isDemoOrderTriggered(order, marketPrice) {
  if (
    !order ||
    !Number.isFinite(order.price) ||
    !Number.isFinite(marketPrice) ||
    marketPrice <= 0
  ) {
    return false;
  }

  const difference = Math.round((marketPrice - order.price) * 100) / 100;
  if (Math.abs(difference) <= touchTolerance) return true;
  if (order.side === "buy" && order.type === "Limit") return difference <= -gapThreshold;
  if (
    (order.side === "buy" && order.type === "Stop") ||
    (order.side === "sell" && order.type === "Limit")
  ) {
    return difference >= gapThreshold;
  }
  return false;
}

export function demoFillPrice(order, marketPrice) {
  if (!Number.isFinite(order?.price) || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    return undefined;
  }
  if (order.type === "Stop") return marketPrice;
  if (order.type === "Limit" && order.side === "buy") return Math.min(marketPrice, order.price);
  if (order.type === "Limit" && order.side === "sell") return Math.max(marketPrice, order.price);
  return undefined;
}

export function calculateDemoPnl(side, entryPrice, marketPrice, quantity = DEMO_LOT_SIZE) {
  if (
    !["buy", "sell"].includes(side) ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(marketPrice) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return undefined;
  }
  return (side === "buy" ? marketPrice - entryPrice : entryPrice - marketPrice) * quantity;
}
