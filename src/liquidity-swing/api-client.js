function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSwing(swing) {
  return (
    swing === null ||
    (isRecord(swing) &&
      swing.side === "high" &&
      Number.isFinite(swing.level) &&
      Number.isFinite(swing.zoneBottom) &&
      Number.isFinite(swing.zoneTop) &&
      typeof swing.pivotTime === "string" &&
      typeof swing.confirmedAt === "string" &&
      Number.isInteger(swing.intersectionCount) &&
      Number.isFinite(swing.intersectionVolume) &&
      ["tracking", "qualified", "broken"].includes(swing.status))
  );
}

export async function fetchLiquiditySwingsFromApi(
  instruments,
  { apiUrl, apiSecret },
  fetchImpl = fetch,
) {
  if (
    !Array.isArray(instruments) ||
    instruments.length !== 2 ||
    instruments.some(
      (instrument) =>
        !isRecord(instrument) ||
        typeof instrument.token !== "string" ||
        !instrument.token.startsWith("nse_fo|") ||
        !["CALL", "PUT"].includes(instrument.optionSide),
    )
  ) {
    throw new Error("A NIFTY call and put token are required for swing analysis");
  }
  const sides = new Set(instruments.map(({ optionSide }) => optionSide));
  if (sides.size !== 2) throw new Error("Swing analysis requires one call and one put token");
  if (typeof apiUrl !== "string" || apiUrl.trim() === "") {
    throw new Error("Missing required environment variable: SWING_API_URL");
  }
  if (typeof apiSecret !== "string" || apiSecret.trim() === "") {
    throw new Error("Missing required environment variable: SWING_API_SECRET");
  }

  let endpoint;
  try {
    endpoint = new URL(apiUrl);
  } catch {
    throw new Error("Vercel swing API URL must be a valid HTTPS URL");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
    throw new Error("Vercel swing API URL must be a valid HTTPS URL");
  }
  endpoint.search = "";

  const response = await fetchImpl(endpoint, {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${apiSecret}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instruments: instruments.map(({ optionSide, token }) => ({ optionSide, token })),
    }),
  });
  if (!response.ok) {
    throw new Error(`Vercel swing API request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.analyses) ||
    payload.analyses.length !== instruments.length
  ) {
    throw new Error("Vercel swing API returned invalid analysis data");
  }

  return instruments.map((instrument) => {
    const analysis = payload.analyses.find(
      (candidate) =>
        isRecord(candidate) &&
        candidate.optionSide === instrument.optionSide &&
        candidate.token === instrument.token,
    );
    if (
      !analysis ||
      analysis.interval !== "1min" ||
      !Number.isInteger(analysis.pivotLookback) ||
      analysis.pivotLookback < 1 ||
      !isValidSwing(analysis.swing)
    ) {
      throw new Error("Vercel swing API returned invalid analysis data");
    }

    return {
      optionSide: instrument.optionSide,
      instrument: instrument.instrument,
      swing: analysis.swing,
      interval: analysis.interval,
      pivotLookback: analysis.pivotLookback,
    };
  });
}
