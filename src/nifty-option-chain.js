import { createKotakApiUrl } from "./kotak-api.js";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionEntries(response, side) {
  if (!isRecord(response)) {
    throw new Error("Kotak returned an invalid option-chain response");
  }
  const payload = isRecord(response.data) ? response.data : response;
  if (!Array.isArray(payload[side])) {
    throw new Error(`Kotak option-chain response did not contain ${side} options`);
  }
  return payload[side];
}

function numericVolume(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const volume = Number(value);
  return Number.isFinite(volume) && volume >= 0 ? volume : undefined;
}

function highestVolumeInstrument(entries, optionType) {
  let highest;
  for (const entry of entries) {
    if (!isRecord(entry) || !isRecord(entry.quote)) continue;
    const instrument = isRecord(entry.instrument)
      ? entry.instrument
      : isRecord(entry.inst)
        ? entry.inst
        : undefined;
    if (!instrument) continue;

    const volume = numericVolume(entry.quote.volume ?? entry.quote.vol);
    const symbol = instrument.symbol;
    const token = instrument.neoSymbol ?? instrument.instrumentToken ?? instrument.token;
    if (
      volume === undefined ||
      typeof symbol !== "string" ||
      typeof token !== "string" ||
      (instrument.optionType !== undefined && instrument.optionType !== optionType) ||
      (instrument.optType !== undefined && instrument.optType !== optionType)
    ) {
      continue;
    }

    if (!highest || volume > highest.volume) {
      highest = { optionType, symbol, token, volume };
    }
  }

  if (!highest) {
    throw new Error(`Kotak returned no valid ${optionType} instruments with volume`);
  }
  return highest;
}

export function selectHighestVolumeCallAndPut(response) {
  return {
    call: highestVolumeInstrument(optionEntries(response, "call"), "CE"),
    put: highestVolumeInstrument(optionEntries(response, "put"), "PE"),
  };
}

export async function fetchHighestVolumeNiftyOptions(
  { apiToken, baseUrl, count = 10 },
  fetchImpl = fetch,
) {
  if (typeof apiToken !== "string" || apiToken.trim() === "") {
    throw new Error("Missing required environment variable: KOTAK_NEO_API_TOKEN");
  }
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("Missing required environment variable: KOTAK_NEO_BASE_URL");
  }
  const optionChainCount = Number(count);
  if (!Number.isSafeInteger(optionChainCount) || optionChainCount < 1) {
    throw new RangeError("NIFTY_OPTION_CHAIN_COUNT must be a positive integer");
  }

  const endpoint = createKotakApiUrl(
    baseUrl,
    "market-data/1.0/watchlist/option-chain",
    {
      exchange: "nse_fo",
      underlying: "NIFTY",
      instrument_type: "option",
      expiry: "2026-12-01",
      count: String(optionChainCount),
    },
  );

  const response = await fetchImpl(endpoint, {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Kotak option-chain request failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  if (isRecord(data) && typeof data.stat === "string" && data.stat.toLowerCase() !== "ok") {
    const code = data.stCode === undefined ? "" : ` (code ${String(data.stCode)})`;
    throw new Error(`Kotak rejected the option-chain request${code}`);
  }
  return selectHighestVolumeCallAndPut(data);
}
