import { getHighestVolumeOptions } from "../../internal/services/highest-volume-options.service.js";

export function getAutoTradeProcessData(
  optionChainQuery,
  ltpRange,
  getHighestVolumeOptionsImpl = getHighestVolumeOptions,
) {
  return getHighestVolumeOptionsImpl(optionChainQuery, ltpRange);
}
