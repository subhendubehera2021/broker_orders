import {
  fetchHistoricalBars,
  findLatestLiquiditySwingHigh,
  recentIndiaDateRange,
} from "../../internal/lib/liquidity-swings.js";
import { aggregateOneMinuteBarsToThreeMinutes } from "../lib/candle-aggregation.js";

const OPTION_SIDES = ["CE", "PE"];

async function getBarsForResolutions(
  symbol,
  resolutions,
  dateRange,
  fetchHistoricalBarsImpl,
) {
  const barsByResolution = new Map();
  const needsMinuteBars = resolutions.includes("1") || resolutions.includes("3");

  if (needsMinuteBars) {
    const minuteBars = await fetchHistoricalBarsImpl(symbol, {
      ...dateRange,
      resolution: "1",
    });
    barsByResolution.set("1", minuteBars);
    if (resolutions.includes("3")) {
      barsByResolution.set(
        "3",
        aggregateOneMinuteBarsToThreeMinutes(minuteBars),
      );
    }
  }

  const nativeResolutions = resolutions.filter(
    (resolution) => resolution !== "1" && resolution !== "3",
  );
  await Promise.all(
    nativeResolutions.map(async (resolution) => {
      const bars = await fetchHistoricalBarsImpl(symbol, {
        ...dateRange,
        resolution,
      });
      barsByResolution.set(resolution, bars);
    }),
  );

  return barsByResolution;
}

export async function processSelectedOptions(
  highestVolume,
  {
    swingConfigs = [{ resolution: "1", pivotLookback: 5 }],
    fetchHistoricalBarsImpl = fetchHistoricalBars,
    dateRange = recentIndiaDateRange(),
  } = {},
) {
  const selected = OPTION_SIDES.flatMap((side) => {
    const option = highestVolume[side];
    if (option === null) {
      return [];
    }

    return [{ side, option }];
  });

  const contracts = await Promise.all(
    selected.map(async ({ side, option }) => {
      const resolutions = [...new Set(swingConfigs.map(({ resolution }) => resolution))];
      const barsByResolution = await getBarsForResolutions(
        option.symbol,
        resolutions,
        dateRange,
        fetchHistoricalBarsImpl,
      );
      const liquiditySwings = swingConfigs.map(({ resolution, pivotLookback }) => {
        const bars = barsByResolution.get(resolution);
        return {
          resolution,
          pivotLookback,
          barsAnalyzed: bars.length,
          source: resolution === "3" ? "aggregated-from-1-minute" : "fyers",
          swing: findLatestLiquiditySwingHigh(bars, { pivotLookback }) ?? null,
        };
      });

      return {
        option_type: side,
        symbol: option.symbol,
        ltp: option.ltp,
        volume: option.volume,
        liquiditySwings: {
          fromDate: dateRange.fromDate,
          toDate: dateRange.toDate,
          configurations: liquiditySwings,
        },
      };
    }),
  );

  return {
    selectedCount: contracts.length,
    totalVolume: contracts.reduce((total, contract) => total + contract.volume, 0),
    contracts,
  };
}
