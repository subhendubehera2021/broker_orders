type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericValue(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function chainPayload(value: unknown): JsonRecord | undefined {
  if (!isRecord(value)) return undefined;
  if (Array.isArray(value.call) || Array.isArray(value.put)) return value;
  for (const key of ["data", "result", "optionChain", "option_chain", "chain"]) {
    const nested = chainPayload(value[key]);
    if (nested) return nested;
  }
  return undefined;
}

export function extractOptionVolumes(response: unknown): Record<string, number> {
  const payload = chainPayload(response);
  if (!payload) return {};

  const volumes: Record<string, number> = {};
  for (const side of ["call", "put"]) {
    const entries = payload[side];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isRecord(entry) || !isRecord(entry.quote)) continue;
      const instrument = isRecord(entry.inst)
        ? entry.inst
        : isRecord(entry.instrument)
          ? entry.instrument
          : undefined;
      if (typeof instrument?.symbol !== "string") continue;
      const volume = numericValue(entry.quote.vol ?? entry.quote.volume);
      if (volume !== undefined) volumes[instrument.symbol] = volume;
    }
  }
  return volumes;
}
