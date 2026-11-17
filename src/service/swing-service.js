import { fetchLiquiditySwings, recentIndiaDateRange } from "../liquidity-swing/index.js";
import { fetchHighestVolumeNiftyOptions } from "../nifty-option-chain.js";

function waitForRequestSlot() {
  return new Promise((resolve) => setTimeout(resolve, 1_000));
}

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
  const analyses = [];
  for (const [index, [optionSide, instrument]] of [
    ["CALL", instruments.call],
    ["PUT", instruments.put],
  ].entries()) {
    if (index > 0) await waitForRequestSlot();
    const analysis = await fetchLiquiditySwings(
      { token: instrument.token },
      { apiToken, baseUrl, ...dateRange },
    );
    analyses.push({
      optionSide,
      symbol: instrument.symbol,
      token: instrument.token,
      optionVolume: instrument.volume,
      interval: analysis.interval,
      pivotLookback: analysis.pivotLookback,
      bars: analysis.bars.length,
      swing: analysis.swing ?? null,
    });
  }

  const persistence = await persistAnalyses(analyses, dbClient);
  return {
    ...persistence,
    selected: instruments,
    analyses,
  };
}
