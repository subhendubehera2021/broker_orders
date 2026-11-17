const processedOrders = new Set();

export function getOrderKey({ tradingSymbol, triggerPrice, pivotTime }) {
  return [
    tradingSymbol || "",
    triggerPrice != null ? String(triggerPrice) : "",
    pivotTime || "",
  ].join(":");
}

export function hasOrderBeenProcessed(orderSignature) {
  const key = getOrderKey(orderSignature);
  return processedOrders.has(key);
}

export function markOrderProcessed(orderSignature) {
  const key = getOrderKey(orderSignature);
  processedOrders.add(key);
}

export function clearProcessedOrders() {
  processedOrders.clear();
}
