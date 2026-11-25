import { parseOptionChainModel } from "../../fyers/models/option-chain.model.js";
import { getOptionChain } from "../../fyers/services/option-chain.service.js";

function findHighestVolumeOption(optionsChain, optionType, ltpMin, ltpMax) {
  let highestVolumeOption = null;

  for (const option of optionsChain) {
    if (
      option.option_type !== optionType ||
      typeof option.ltp !== "number" ||
      !Number.isFinite(option.ltp) ||
      (ltpMin !== null && option.ltp < ltpMin) ||
      (ltpMax !== null && option.ltp > ltpMax) ||
      typeof option.volume !== "number" ||
      !Number.isFinite(option.volume)
    ) {
      continue;
    }

    if (highestVolumeOption === null || option.volume > highestVolumeOption.volume) {
      highestVolumeOption = option;
    }
  }

  return highestVolumeOption;
}

export async function getHighestVolumeOptions(
  optionChainQuery,
  ltpRange,
  getOptionChainImpl = getOptionChain,
) {
  const providerResponse = await getOptionChainImpl(optionChainQuery);
  if (!providerResponse?.data) {
    const error = new Error(
      providerResponse?.message || "Fyers returned no option-chain data.",
    );
    error.statusCode = 502;
    throw error;
  }

  const optionChain = parseOptionChainModel(providerResponse.data);
  return {
    symbol: optionChainQuery.symbol,
    ltpRange,
    highestVolume: {
      CE: findHighestVolumeOption(
        optionChain.optionsChain,
        "CE",
        ltpRange.ltpMin,
        ltpRange.ltpMax,
      ),
      PE: findHighestVolumeOption(
        optionChain.optionsChain,
        "PE",
        ltpRange.ltpMin,
        ltpRange.ltpMax,
      ),
    },
  };
}
