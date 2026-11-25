import { getHighestVolumeOptions } from "../../internal/services/highest-volume-options.service.js";
import { saveChangedLiquiditySwings } from "../repositories/liquidity-swing.repository.js";
import { processSelectedOptions } from "./step-two.service.js";

export async function getAutoTradeProcessData(
  optionChainQuery,
  ltpRange,
  {
    swingConfigs = [{ resolution: "1", pivotLookback: 5 }],
    getHighestVolumeOptionsImpl = getHighestVolumeOptions,
    processSelectedOptionsImpl = processSelectedOptions,
    saveChangedLiquiditySwingsImpl = saveChangedLiquiditySwings,
  } = {},
) {
  const selection = await getHighestVolumeOptionsImpl(optionChainQuery, ltpRange);
  const step2 = await processSelectedOptionsImpl(selection.highestVolume, {
    swingConfigs,
  });
  const persistence = await saveChangedLiquiditySwingsImpl(step2);
  return {
    ...selection,
    step2: { ...step2, persistence },
  };
}
