import { fetchLiquiditySwings, recentIndiaDateRange } from "../liquidity-swing/index.js";
import { fetchHighestVolumeNiftyOptions } from "../nifty-option-chain.js";

export async function processNiftyOptionChain({
  apiToken,
  baseUrl,
  count,
  createDbClient,
  persistOptionChain,
}) {
  console.log("[nifty-option-chain-service] Starting option chain fetch...");
  const dbClient = createDbClient();
  const selected = await fetchHighestVolumeNiftyOptions({
    apiToken,
    baseUrl,
    count,
  });
  console.log("[nifty-option-chain-service] Fetched highest volume options successfully:", {
    callSymbol: selected.call?.symbol,
    putSymbol: selected.put?.symbol,
  });
  await persistOptionChain(selected, dbClient);
  console.log("[nifty-option-chain-service] Option chain persisted successfully.");
  return selected;
}

export async function processLiquiditySwing({
  apiToken,
  baseUrl,
  count,
  createDbClient,
  persistAnalyses,
}) {
  console.log("[liquidity-swing-service] Starting liquidity swing process...", { baseUrl });
  const dbClient = createDbClient();

  let instruments;
  try {
    instruments = await fetchHighestVolumeNiftyOptions({
      apiToken,
      baseUrl,
      count,
    });
    console.log("[liquidity-swing-service] Highest volume options fetched:", {
      call: instruments.call?.symbol,
      put: instruments.put?.symbol,
    });
  } catch (error) {
    console.error("[liquidity-swing-service] Failed to fetch highest volume options:", {
      message: error.message,
      code: error.code,
      cause: error.cause,
      stack: error.stack,
    });
    throw error;
  }

  const dateRange = recentIndiaDateRange();
  console.log("[liquidity-swing-service] Starting parallel CALL & PUT liquidity swing fetch...", dateRange);

  let analyses;
  try {
    analyses = await Promise.all([
      fetchLiquiditySwings(
        { token: instruments.call.token },
        { apiToken, baseUrl, ...dateRange },
      ).then((analysis) => {
        console.log("[liquidity-swing-service] fetchLiquiditySwings completed for CALL:", instruments.call.symbol);
        return {
          optionSide: "CALL",
          symbol: instruments.call.symbol,
          token: instruments.call.token,
          optionVolume: instruments.call.volume,
          interval: analysis.interval,
          pivotLookback: analysis.pivotLookback,
          bars: analysis.bars.length,
          swing: analysis.swing ?? null,
        };
      }),
      fetchLiquiditySwings(
        { token: instruments.put.token },
        { apiToken, baseUrl, ...dateRange },
      ).then((analysis) => {
        console.log("[liquidity-swing-service] fetchLiquiditySwings completed for PUT:", instruments.put.symbol);
        return {
          optionSide: "PUT",
          symbol: instruments.put.symbol,
          token: instruments.put.token,
          optionVolume: instruments.put.volume,
          interval: analysis.interval,
          pivotLookback: analysis.pivotLookback,
          bars: analysis.bars.length,
          swing: analysis.swing ?? null,
        };
      }),
    ]);
    console.log("[liquidity-swing-service] Liquidity swing analysis completed successfully for both CALL & PUT.");
  } catch (error) {
    console.error("[liquidity-swing-service] Liquidity swing analysis fetch failed:", {
      message: error.message,
      code: error.code,
      cause: error.cause,
      stack: error.stack,
    });
    throw error;
  }

  try {
    const persistence = await persistAnalyses(analyses, dbClient);
    console.log("[liquidity-swing-service] Analyses persisted to Turso successfully:", persistence);
    return {
      ...persistence,
      selected: instruments,
      analyses,
    };
  } catch (error) {
    console.error("[liquidity-swing-service] Failed to persist analyses to database:", {
      message: error.message,
      code: error.code,
      cause: error.cause,
      stack: error.stack,
    });
    throw error;
  }
}
