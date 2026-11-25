import { getHighestVolumeOptions } from "../../internal/services/highest-volume-options.service.js";
import { processSelectedOptions } from "./step-two.service.js";

export async function getAutoTradeProcessData(
  optionChainQuery,
  ltpRange,
  {
    swingConfigs = [{ resolution: "1", pivotLookback: 5 }],
    getHighestVolumeOptionsImpl = getHighestVolumeOptions,
    processSelectedOptionsImpl = processSelectedOptions,
  } = {},
) {
  const selection = await getHighestVolumeOptionsImpl(optionChainQuery, ltpRange);
  return {
    ...selection,
    step2: await processSelectedOptionsImpl(selection.highestVolume, {
      swingConfigs,
    }),
  };
}
