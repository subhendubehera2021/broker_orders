import { placeBuySlLimitOrder } from "./buy-sl-limit-client.js";
import { cancelOrder } from "./cancel-order-client.js";
import {
  hasOrderBeenProcessed,
  markOrderProcessed,
  getStoredOrdersBySide,
} from "./order-engine.js";

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
      return null;
    }

    const existingOrders = getStoredOrdersBySide(optionSide);
    const previousOrder = existingOrders.find(
      (order) => order && (order.nOrdNo || order.orderNumber),
    );

    if (previousOrder) {
      const prevOrderNo = previousOrder.nOrdNo || previousOrder.orderNumber;
      const prevSymbol =
        previousOrder.orderSignature?.tradingSymbol ||
        previousOrder.tradingSymbol ||
        instrument.symbol;

      try {
        console.log(
          `[swing-order-executor] Cancelling previous ${optionSide} order ${prevOrderNo} (${prevSymbol})...`,
        );
        await cancelOrder({
          baseUrl: orderBaseUrl || "https://trade.brinto.in",
          accessToken: orderAccessToken,
          orderNumber: prevOrderNo,
          tradingSymbol: prevSymbol,
        });
      } catch (cancelError) {
        console.error(
          `Failed to cancel previous ${optionSide} order ${prevOrderNo}:`,
          cancelError,
        );
      }
    }

    try {
      orderResult = await placeBuySlLimitOrder({
        baseUrl: orderBaseUrl || "https://trade.brinto.in",
        accessToken: orderAccessToken,
        tradingSymbol: instrument.symbol,
        quantity: orderQuantity,
        triggerPrice: String(analysis.swing.level),
      });
      markOrderProcessed(orderSignature, {
        ...orderResult,
        optionSide,
        tradingSymbol: instrument.symbol,
      });
    } catch (orderError) {
      console.error(
        `Failed to place BUY SL-Limit order for ${optionSide} (${instrument.symbol}):`,
        orderError,
      );
    }
  }
  return orderResult;
}
