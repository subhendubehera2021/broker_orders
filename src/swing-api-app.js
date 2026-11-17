import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fetchLiquiditySwings, recentIndiaDateRange } from "./liquidity-swing/index.js";
import { fetchHighestVolumeNiftyOptions } from "./nifty-option-chain.js";
import {
  getTursoClient,
  persistNiftyOptionChain,
  persistSwingAnalyses,
} from "./turso-storage.js";

const swaggerHtml = await readFile(new URL("../public/swagger.html", import.meta.url), "utf8");
const openApiJson = await readFile(new URL("../public/openapi.json", import.meta.url), "utf8");

function isAuthorized(authorization, expectedSecret) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return false;
  }

  const actual = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedSecret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authorizeRequest(request, reply) {
  const expectedSecret = process.env.SWING_API_SECRET;
  if (typeof expectedSecret !== "string" || expectedSecret.length === 0) {
    console.error("[nifty-api] SWING_API_SECRET is not configured");
    reply.code(500).send({ error: "API is not configured" });
    return false;
  }
  if (!isAuthorized(request.headers.authorization, expectedSecret)) {
    reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function getKotakCredentials(reply) {
  const apiToken = process.env.KOTAK_NEO_API_TOKEN;
  const baseUrl = process.env.KOTAK_NEO_BASE_URL;
  if (
    typeof apiToken !== "string" ||
    apiToken.trim() === "" ||
    typeof baseUrl !== "string" ||
    baseUrl.trim() === ""
  ) {
    console.error("[nifty-api] Kotak credentials are not configured");
    reply.code(500).send({ error: "API is not configured" });
    return null;
  }
  return { apiToken, baseUrl };
}

function formatIndiaTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} IST`;
}

function waitForRequestSlot() {
  return new Promise((resolve) => setTimeout(resolve, 1_000));
}

export function registerSwingApiRoutes(
  app,
  {
    createDbClient = getTursoClient,
    persistAnalyses = persistSwingAnalyses,
    persistOptionChain = persistNiftyOptionChain,
  } = {},
) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });

  app.get("/swagger.html", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(swaggerHtml);
  });

  app.get("/openapi.json", async (_request, reply) => {
    return reply.type("application/json").send(openApiJson);
  });

  app.all("/api/nifty-option-chain", async (request, reply) => {
    if (request.method !== "GET") {
      return reply.header("Allow", "GET").code(405).send({ error: "Method not allowed" });
    }
    if (!authorizeRequest(request, reply)) return;

    const credentials = getKotakCredentials(reply);
    if (!credentials) return;

    let dbClient;
    try {
      dbClient = createDbClient();
    } catch (error) {
      console.error("[nifty-api] Turso is not configured", error);
      return reply.code(500).send({ error: "Option-chain API database is not configured" });
    }

    let selected;
    try {
      selected = await fetchHighestVolumeNiftyOptions({
        ...credentials,
        count: process.env.NIFTY_OPTION_CHAIN_COUNT,
      });
    } catch (error) {
      console.error("[nifty-api] Option-chain request failed", error);
      return reply.code(502).send({ error: "Unable to fetch NIFTY option chain" });
    }

    try {
      await persistOptionChain(selected, dbClient);
    } catch (error) {
      console.error("[nifty-api] Turso option-chain write failed", error);
      return reply.code(503).send({ error: "Unable to store NIFTY option chain" });
    }
    return reply.code(200).send(selected);
  });

  app.all("/api/liquidity-swing", async (request, reply) => {
    console.log(`[liquidity-swing-api] Request received at ${formatIndiaTime()} IST`);

    if (request.method !== "GET") {
      return reply.header("Allow", "GET").code(405).send({ error: "Method not allowed" });
    }

    if (!authorizeRequest(request, reply)) return;
    const credentials = getKotakCredentials(reply);
    if (!credentials) return;
    const { apiToken, baseUrl } = credentials;

    let dbClient;
    try {
      dbClient = createDbClient();
    } catch (error) {
      console.error("[liquidity-swing-api] Turso is not configured", error);
      return reply.code(500).send({ error: "Swing API database is not configured" });
    }

    let analyses;
    let instruments;
    try {
      instruments = await fetchHighestVolumeNiftyOptions({
        apiToken,
        baseUrl,
        count: process.env.NIFTY_OPTION_CHAIN_COUNT,
      });
      const dateRange = recentIndiaDateRange();
      analyses = [];
      for (const [index, [optionSide, instrument]] of [
        ["CALL", instruments.call],
        ["PUT", instruments.put],
      ].entries()) {
        if (index > 0) await waitForRequestSlot();
        const analysis = await fetchLiquiditySwings(
          { token: instrument.token },
          { apiToken, baseUrl, ...dateRange },
        );
        analyses.push({
          optionSide,
          symbol: instrument.symbol,
          token: instrument.token,
          optionVolume: instrument.volume,
          interval: analysis.interval,
          pivotLookback: analysis.pivotLookback,
          bars: analysis.bars.length,
          swing: analysis.swing ?? null,
        });
      }
    } catch (error) {
      console.error("[liquidity-swing-api] Option-chain or swing analysis failed", error);
      return reply.code(502).send({ error: "Unable to fetch swing analysis" });
    }

    let persistence;
    try {
      persistence = await persistAnalyses(analyses, dbClient);
    } catch (error) {
      console.error("[liquidity-swing-api] Turso write failed", error);
      return reply.code(503).send({ error: "Unable to store swing analysis" });
    }
    return reply.code(200).send({
      ...persistence,
      selected: instruments,
      analyses,
    });
  });
}
