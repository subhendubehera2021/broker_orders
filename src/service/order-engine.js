import {
  isSwingOrderProcessedDb,
  getActiveSwingOrdersByStrategyKeyDb,
  recordActiveSwingOrderDb,
  markSwingOrderCancelledDb,
} from "../turso-storage.js";

const processedOrders = new Set();
const orderDetailsStore = new Map();

export function getStrategyKey(optionSide, pivotLookback = 5) {
  const side = (optionSide || "").toLowerCase();
  return `nifty_${pivotLookback}_1m_${side}`;
}

export function getOrderKey({ tradingSymbol, triggerPrice, pivotTime, optionSide, strategyKey }) {
  const key = strategyKey || getStrategyKey(optionSide);
  return [
    key,
    tradingSymbol || "",
    triggerPrice != null ? String(triggerPrice) : "",
    pivotTime || "",
  ].join(":");
}

export async function hasOrderBeenProcessed(orderSignature, dbClient = null) {
  const key = getOrderKey(orderSignature);
  if (processedOrders.has(key)) return true;
  if (dbClient) {
    const existsInDb = await isSwingOrderProcessedDb(dbClient, orderSignature);
    if (existsInDb) {
      processedOrders.add(key);
      return true;
    }
  }
  return false;
}

export async function markOrderProcessed(
  orderSignature,
  orderResult = null,
  dbClient = null,
) {
  const key = getOrderKey(orderSignature);
  processedOrders.add(key);
  const strategyKey = orderSignature.strategyKey || getStrategyKey(orderSignature.optionSide);

  if (orderResult) {
    const record = {
      ...orderResult,
      strategyKey,
      orderSignature,
      recordedAt: new Date().toISOString(),
    };
    orderDetailsStore.set(key, record);
    if (orderResult.nOrdNo) {
      orderDetailsStore.set(String(orderResult.nOrdNo), record);
    }
    if (dbClient && orderResult.nOrdNo) {
      await recordActiveSwingOrderDb(dbClient, {
        strategyKey,
        optionSide: orderSignature.optionSide,
        tradingSymbol: orderSignature.tradingSymbol,
        triggerPrice: orderSignature.triggerPrice,
        pivotTime: orderSignature.pivotTime,
        orderNumber: orderResult.nOrdNo,
      });
    }
  }
}

export async function markOrderCancelled(orderNumber, dbClient = null) {
  if (orderNumber) {
    const record = orderDetailsStore.get(String(orderNumber));
    if (record) {
      record.status = "CANCELLED";
    }
    if (dbClient) {
      await markSwingOrderCancelledDb(dbClient, orderNumber);
    }
  }
}

export function getStoredOrder(orderSignatureOrNo) {
  if (typeof orderSignatureOrNo === "object" && orderSignatureOrNo !== null) {
    const key = getOrderKey(orderSignatureOrNo);
    return orderDetailsStore.get(key) || null;
  }
  return orderDetailsStore.get(String(orderSignatureOrNo)) || null;
}

export async function getStoredOrdersBySide(optionSide, dbClient = null, pivotLookback = 5) {
  const strategyKey = getStrategyKey(optionSide, pivotLookback);
  if (dbClient) {
    const dbOrders = await getActiveSwingOrdersByStrategyKeyDb(dbClient, strategyKey);
    if (dbOrders && dbOrders.length > 0) {
      return dbOrders;
    }
  }
  return getAllStoredOrders().filter(
    (order) =>
      order.strategyKey === strategyKey ||
      order.optionSide === optionSide ||
      order.orderSignature?.optionSide === optionSide,
  );
}

export function getAllStoredOrders() {
  const uniqueOrders = new Map();
  for (const [key, value] of orderDetailsStore.entries()) {
    if (value && value.nOrdNo && String(key) === String(value.nOrdNo)) {
      uniqueOrders.set(value.nOrdNo, value);
    }
  }
  return Array.from(uniqueOrders.values());
}

export function clearProcessedOrders() {
  processedOrders.clear();
  orderDetailsStore.clear();
}
