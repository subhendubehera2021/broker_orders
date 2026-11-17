const processedOrders = new Set();
const orderDetailsStore = new Map();

export function getOrderKey({ tradingSymbol, triggerPrice, pivotTime, optionSide }) {
  return [
    tradingSymbol || "",
    triggerPrice != null ? String(triggerPrice) : "",
    pivotTime || "",
    optionSide || "",
  ].join(":");
}

export function hasOrderBeenProcessed(orderSignature) {
  const key = getOrderKey(orderSignature);
  return processedOrders.has(key);
}

export function markOrderProcessed(orderSignature, orderResult = null) {
  const key = getOrderKey(orderSignature);
  processedOrders.add(key);
  if (orderResult) {
    const record = {
      ...orderResult,
      orderSignature,
      recordedAt: new Date().toISOString(),
    };
    orderDetailsStore.set(key, record);
    if (orderResult.nOrdNo) {
      orderDetailsStore.set(String(orderResult.nOrdNo), record);
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

export function getAllStoredOrders() {
  const uniqueOrders = new Map();
  for (const [key, value] of orderDetailsStore.entries()) {
    if (value && value.nOrdNo && String(key) === String(value.nOrdNo)) {
      uniqueOrders.set(value.nOrdNo, value);
    }
  }
  return Array.from(uniqueOrders.values());
}

export function getStoredOrdersBySide(optionSide) {
  return getAllStoredOrders().filter(
    (order) =>
      order.optionSide === optionSide ||
      order.orderSignature?.optionSide === optionSide,
  );
}

export function clearProcessedOrders() {
  processedOrders.clear();
  orderDetailsStore.clear();
}
