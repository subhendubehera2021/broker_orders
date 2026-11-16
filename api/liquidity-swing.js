import { timingSafeEqual } from "node:crypto";
import { fetchLiquiditySwings, recentIndiaDateRange } from "../src/liquidity-swing/index.js";

function waitForRequestSlot() {
  return new Promise((resolve) => setTimeout(resolve, 1_000));
}

function isAuthorized(authorization, expectedSecret) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return false;
  }

  const actual = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedSecret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const expectedSecret = process.env.SWING_API_SECRET;
  if (typeof expectedSecret !== "string" || expectedSecret.length === 0) {
    console.error("[liquidity-swing-api] SWING_API_SECRET is not configured");
    return response.status(500).json({ error: "Swing API is not configured" });
  }
  if (!isAuthorized(request.headers.authorization, expectedSecret)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const instruments = request.body?.instruments;
  if (
    !Array.isArray(instruments) ||
    instruments.length !== 2 ||
    instruments.some(
      (instrument) =>
        typeof instrument !== "object" ||
        instrument === null ||
        Array.isArray(instrument) ||
        !["CALL", "PUT"].includes(instrument.optionSide) ||
        typeof instrument.token !== "string" ||
        instrument.token.length > 80 ||
        !/^nse_fo\|[A-Za-z0-9._-]+$/.test(instrument.token),
    ) ||
    new Set(instruments.map(({ optionSide }) => optionSide)).size !== 2
  ) {
    return response.status(400).json({ error: "A NIFTY call and put token are required" });
  }

  const apiToken = process.env.KOTAK_NEO_API_TOKEN;
  const baseUrl = process.env.KOTAK_NEO_BASE_URL;
  if (
    typeof apiToken !== "string" ||
    apiToken.trim() === "" ||
    typeof baseUrl !== "string" ||
    baseUrl.trim() === ""
  ) {
    console.error("[liquidity-swing-api] Kotak credentials are not configured");
    return response.status(500).json({ error: "Swing API is not configured" });
  }

  try {
    const dateRange = recentIndiaDateRange();
    const analyses = [];
    for (const [index, { token, optionSide }] of instruments.entries()) {
      if (index > 0) await waitForRequestSlot();
      const analysis = await fetchLiquiditySwings(
        { token },
        { apiToken, baseUrl, ...dateRange },
      );
      analyses.push({
        optionSide,
        token,
        interval: analysis.interval,
        pivotLookback: analysis.pivotLookback,
        bars: analysis.bars.length,
        swing: analysis.swing ?? null,
      });
    }
    return response.status(200).json({ analyses });
  } catch (error) {
    console.error("[liquidity-swing-api] Historical swing analysis failed", error);
    return response.status(502).json({ error: "Unable to fetch swing analysis" });
  }
}
