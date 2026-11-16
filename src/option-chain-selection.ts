export interface OptionChainPriceRange {
  minPrice: number;
  maxPrice: number;
}

export function selectHighestVolumeCallAndPut(
  response: unknown,
  range: OptionChainPriceRange,
): unknown {
  return selectWithinEnvelope(response, range).value;
}

function selectWithinEnvelope(
  value: unknown,
  range: OptionChainPriceRange,
): { value: unknown; found: boolean } {
  if (!isRecord(value)) return { value, found: false };

  const callEntries = value.call ?? value.calls;
  const putEntries = value.put ?? value.puts;
  if (Array.isArray(callEntries) && Array.isArray(putEntries)) {
    const callKey = Array.isArray(value.call) ? "call" : "calls";
    const putKey = Array.isArray(value.put) ? "put" : "puts";
    return {
      value: {
        ...value,
        [callKey]: highestVolumeEntry(callEntries, range),
        [putKey]: highestVolumeEntry(putEntries, range),
      },
      found: true,
    };
  }

  for (const key of ["data", "result", "optionChain", "option_chain", "chain"]) {
    const nested = value[key];
    if (!isRecord(nested)) continue;
    const selected = selectWithinEnvelope(nested, range);
    if (selected.found) {
      return { value: { ...value, [key]: selected.value }, found: true };
    }
  }
  return { value, found: false };
}

function highestVolumeEntry(entries: unknown[], range: OptionChainPriceRange): unknown[] {
  let highestVolume = Number.NEGATIVE_INFINITY;
  let highestVolumeEntry: unknown;
  for (const entry of entries) {
    if (!isRecord(entry) || !isRecord(entry.quote)) continue;
    const instrument = isRecord(entry.inst)
      ? entry.inst
      : isRecord(entry.instrument)
        ? entry.instrument
        : undefined;
    if (!instrument) continue;

    const price = numericValue(entry.quote.ltp);
    const volume = numericValue(entry.quote.vol ?? entry.quote.volume);
    if (
      price === undefined ||
      price < range.minPrice ||
      price > range.maxPrice ||
      volume === undefined ||
      volume < 0 ||
      volume <= highestVolume
    ) {
      continue;
    }
    highestVolume = volume;
    highestVolumeEntry = entry;
  }
  return highestVolumeEntry === undefined ? [] : [highestVolumeEntry];
}

function numericValue(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
