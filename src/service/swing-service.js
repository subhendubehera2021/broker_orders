import { fetchLiquiditySwings, recentIndiaDateRange } from "../liquidity-swing/index.js";
import { fetchHighestVolumeNiftyOptions } from "../nifty-option-chain.js";

export async function processNiftyOptionChain({
  apiToken,
  baseUrl,
  count,
  createDbClient,
  persistOptionChain,
}) {
  const dbClient = createDbClient();
  const selected = await fetchHighestVolumeNiftyOptions({
    apiToken,
    baseUrl,
    count,
  });
  await persistOptionChain(selected, dbClient);
  return selected;
}

export async function processLiquiditySwing({
  apiToken,
  baseUrl,
  count,
  createDbClient,
  persistAnalyses,
}) {
  const dbClient = createDbClient();
  const instruments = await fetchHighestVolumeNiftyOptions({
    apiToken,
    baseUrl,
    count,
  });
  const dateRange = recentIndiaDateRange();

  const analyses = await Promise.all([
    fetchLiquiditySwings(
      { token: instruments.call.token },
      { apiToken, baseUrl, ...dateRange },
    ).then((analysis) => ({
      optionSide: "CALL",
      symbol: instruments.call.symbol,
      token: instruments.call.token,
      optionVolume: instruments.call.volume,
      interval: analysis.interval,
      pivotLookback: analysis.pivotLookback,
      bars: analysis.bars.length,
      swing: analysis.swing ?? null,
    })),
    fetchLiquiditySwings(
      { token: instruments.put.token },
      { apiToken, baseUrl, ...dateRange },
    ).then((analysis) => ({
      optionSide: "PUT",
      symbol: instruments.put.symbol,
      token: instruments.put.token,
      optionVolume: instruments.put.volume,
      interval: analysis.interval,
      pivotLookback: analysis.pivotLookback,
      bars: analysis.bars.length,
      swing: analysis.swing ?? null,
    })),
  ]);

  const persistence = await persistAnalyses(analyses, dbClient);
  return {
    ...persistence,
    selected: instruments,
    analyses,
  };
}
