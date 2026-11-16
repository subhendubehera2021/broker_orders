const liquiditySwingApiUrl = "https://broker-orders.vercel.app/api/liquidity-swing";

export async function callLiquiditySwingApi(apiToken) {
  if (typeof apiToken !== "string" || apiToken.trim().length === 0) {
    throw new Error("Missing required Cloudflare secret LIQUIDITY_SWING_API_TOKEN");
  }

  const response = await fetch(liquiditySwingApiUrl, {
    method: "GET",
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${apiToken}`,
    },
    redirect: "error",
  });

  if (!response.ok) {
    throw new Error(`Liquidity swing API request failed with status ${response.status}`);
  }

  return response.status;
}
