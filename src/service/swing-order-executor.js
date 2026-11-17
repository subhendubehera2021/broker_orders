import { placeBuySlLimitOrder } from "./buy-sl-limit-client.js";
import { hasOrderBeenProcessed, markOrderProcessed } from "./order-engine.js";

export async function processSwingOrder({
  optionSide,
  instrument,
  analysis,
  orderBaseUrl,
  orderAccessToken,
  orderQuantity,
  placeOrder,
}) {
  let orderResult = null;
  if (placeOrder && analysis.swing?.level != null) {
    const orderSignature = {
      tradingSymbol: instrument.symbol,
      triggerPrice: analysis.swing.level,
      pivotTime: analysis.swing.pivotTime,
      optionSide,
    };

    if (hasOrderBeenProcessed(orderSignature)) {
      console.log(
        `[swing-order-executor] Order already processed for ${optionSide} (${instrument.symbol}) at pivotTime ${analysis.swing.pivotTime}`,
      );
    } else {
      try {
        orderResult = await placeBuySlLimitOrder({
          baseUrl: orderBaseUrl || "https://trade.brinto.in",
          accessToken: orderAccessToken,
          tradingSymbol: instrument.symbol,
          quantity: orderQuantity,
          triggerPrice: String(analysis.swing.level),
        });
        markOrderProcessed(orderSignature, { ...orderResult, optionSide });
      } catch (orderError) {
        console.error(
          `Failed to place BUY SL-Limit order for ${optionSide} (${instrument.symbol}):`,
          orderError,
        );
      }
    }
  }
  return orderResult;
}
