export async function cancelOrder({
  baseUrl = "https://trade.brinto.in",
  accessToken,
  orderNumber,
  amo = "NO",
  tradingSymbol = "",
} = {}) {
  if (!orderNumber) {
    throw new Error("orderNumber is required to cancel an order");
  }

  const url = new URL("/api/orders/cancel", baseUrl).toString();
  const payload = {
    orderNumber: String(orderNumber),
    on: String(orderNumber),
    orderNo: String(orderNumber),
    amo,
    tradingSymbol,
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
      `Failed to cancel order ${orderNumber} (${response.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}
