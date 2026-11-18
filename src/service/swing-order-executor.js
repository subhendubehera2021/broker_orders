import { placeBuySlLimitOrder } from "./buy-sl-limit-client.js";
import { cancelOrder } from "./cancel-order-client.js";
import {
  getStrategyKey,
  hasOrderBeenProcessed,
  markOrderProcessed,
  markOrderCancelled,
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
  dbClient,
}) {
  let orderResult = null;
  if (placeOrder && analysis.swing?.level != null) {
    const strategyKey = getStrategyKey(optionSide, analysis.pivotLookback || 5);
    const orderSignature = {
      strategyKey,
      tradingSymbol: instrument.symbol,
      triggerPrice: analysis.swing.level,
      pivotTime: analysis.swing.pivotTime,
      optionSide,
    };

    if (await hasOrderBeenProcessed(orderSignature, dbClient)) {
      console.log(
        `[swing-order-executor] Order already processed for ${strategyKey} (${instrument.symbol}) at pivotTime ${analysis.swing.pivotTime}`,
      );
      return null;
    }

    const existingOrders = await getStoredOrdersBySide(
      optionSide,
      dbClient,
      analysis.pivotLookback || 5,
    );
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
          `[swing-order-executor] Cancelling previous ${strategyKey} order ${prevOrderNo} (${prevSymbol})...`,
        );
        await cancelOrder({
          baseUrl: orderBaseUrl || "https://trade.brinto.in",
          accessToken: orderAccessToken,
          orderNumber: prevOrderNo,
          tradingSymbol: prevSymbol,
        });
        await markOrderCancelled(prevOrderNo, dbClient);
      } catch (cancelError) {
        console.error(
          `Failed to cancel previous ${strategyKey} order ${prevOrderNo}:`,
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
      await markOrderProcessed(
        orderSignature,
        {
          ...orderResult,
          strategyKey,
          optionSide,
          tradingSymbol: instrument.symbol,
        },
        dbClient,
      );
    } catch (orderError) {
      console.error(
        `Failed to place BUY SL-Limit order for ${strategyKey} (${instrument.symbol}):`,
        orderError,
      );
    }
  }
  return orderResult;
}
