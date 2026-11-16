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
  { apiToken, baseUrl },
  fetchImpl = fetch,
) {
  if (typeof apiToken !== "string" || apiToken.trim() === "") {
    throw new Error("Missing required KV key: kotak-neo-api-token");
  }
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    throw new Error("Missing required KV key: kotak-neo-base-url");
  }

  let endpoint;
  try {
    const origin = new URL(baseUrl);
    if (
      origin.protocol !== "https:" ||
      (origin.hostname !== "kotaksecurities.com" &&
        !origin.hostname.endsWith(".kotaksecurities.com"))
    ) {
      throw new Error();
    }
    origin.pathname = `${origin.pathname.replace(/\/+$/, "")}/market-data/1.0/watchlist/option-chain`;
    origin.search = new URLSearchParams({
      exchange: "nse_fo",
      underlying: "NIFTY",
      instrument_type: "option",
      count: "40",
    }).toString();
    endpoint = origin;
  } catch {
    throw new Error("Kotak base URL must be an HTTPS Kotak Securities URL");
  }

  const response = await fetchImpl(endpoint, {
    method: "GET",
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
