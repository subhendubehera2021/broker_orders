import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { fetchLiquiditySwings, recentIndiaDateRange } from "./liquidity-swing/index.js";

const swaggerHtml = await readFile(new URL("../public/swagger.html", import.meta.url), "utf8");
const openApiJson = await readFile(new URL("../public/openapi.json", import.meta.url), "utf8");
const app = Fastify({ bodyLimit: 1_024 });

function isAuthorized(authorization, expectedSecret) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return false;
  }

  const actual = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(expectedSecret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isValidInstrument(instrument) {
  return (
    typeof instrument === "object" &&
    instrument !== null &&
    !Array.isArray(instrument) &&
    ["CALL", "PUT"].includes(instrument.optionSide) &&
    typeof instrument.token === "string" &&
    instrument.token.length <= 80 &&
    /^nse_fo\|[A-Za-z0-9._-]+$/.test(instrument.token)
  );
}

function waitForRequestSlot() {
  return new Promise((resolve) => setTimeout(resolve, 1_000));
}

app.addHook("onRequest", async (_request, reply) => {
  reply.header("Cache-Control", "no-store");
});

app.get("/swagger.html", async (_request, reply) => {
  return reply.type("text/html; charset=utf-8").send(swaggerHtml);
});

app.get("/openapi.json", async (_request, reply) => {
  return reply.type("application/json").send(openApiJson);
});

app.all("/api/liquidity-swing", async (request, reply) => {
  if (request.method !== "POST") {
    return reply.header("Allow", "POST").code(405).send({ error: "Method not allowed" });
  }

  const expectedSecret = process.env.SWING_API_SECRET;
  if (typeof expectedSecret !== "string" || expectedSecret.length === 0) {
    console.error("[liquidity-swing-api] SWING_API_SECRET is not configured");
    return reply.code(500).send({ error: "Swing API is not configured" });
  }
  if (!isAuthorized(request.headers.authorization, expectedSecret)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  const instruments = request.body?.instruments;
  if (
    !Array.isArray(instruments) ||
    instruments.length !== 2 ||
    instruments.some((instrument) => !isValidInstrument(instrument)) ||
    new Set(instruments.map(({ optionSide }) => optionSide)).size !== 2
  ) {
    return reply.code(400).send({ error: "A NIFTY call and put token are required" });
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
    return reply.code(500).send({ error: "Swing API is not configured" });
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
    return reply.code(200).send({ analyses });
  } catch (error) {
    console.error("[liquidity-swing-api] Historical swing analysis failed", error);
    return reply.code(502).send({ error: "Unable to fetch swing analysis" });
  }
});

export default app;
