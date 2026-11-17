export async function placeBuySlLimitOrder({
  baseUrl = "https://trade.brinto.in",
  accessToken,
  tradingSymbol,
  quantity,
  triggerPrice,
  price,
  product,
  amo,
  tag,
} = {}) {
  if (!tradingSymbol) {
    throw new Error("tradingSymbol is required");
  }
  if (!quantity) {
    throw new Error("quantity is required");
  }

  const url = new URL("/api/orders/buy-sl-limit", baseUrl).toString();
  const payload = {
    tradingSymbol,
    quantity,
    ...(triggerPrice !== undefined ? { triggerPrice } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(product !== undefined ? { product } : {}),
    ...(amo !== undefined ? { amo } : {}),
    ...(tag !== undefined ? { tag } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `Failed to place BUY SL-Limit order (${response.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}
