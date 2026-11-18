import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { registerFyersAuthRoutes } from "./fyers-auth.js";
import { processNiftyOptionChain, processLiquiditySwing } from "./service/swing-service.js";
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
  registerFyersAuthRoutes(app);

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

    try {
      const selected = await processNiftyOptionChain({
        apiToken: credentials.apiToken,
        baseUrl: credentials.baseUrl,
        count: process.env.NIFTY_OPTION_CHAIN_COUNT,
        createDbClient,
        persistOptionChain,
      });
      return reply.code(200).send(selected);
    } catch (error) {
      if (error.message?.includes("database") || error.code) {
        console.error("[nifty-api] Turso operation failed", error);
        return reply.code(503).send({ error: "Unable to store NIFTY option chain" });
      }
      console.error("[nifty-api] Option-chain request failed", error);
      return reply.code(502).send({ error: "Unable to fetch NIFTY option chain" });
    }
  });

  app.all("/api/liquidity-swing", async (request, reply) => {
    console.log(`[liquidity-swing-api] Request received at ${formatIndiaTime()} IST`);

    if (request.method !== "GET") {
      return reply.header("Allow", "GET").code(405).send({ error: "Method not allowed" });
    }

    if (!authorizeRequest(request, reply)) return;
    const credentials = getKotakCredentials(reply);
    if (!credentials) return;

    try {
      const result = await processLiquiditySwing({
        apiToken: credentials.apiToken,
        baseUrl: credentials.baseUrl,
        count: process.env.NIFTY_OPTION_CHAIN_COUNT,
        createDbClient,
        persistAnalyses,
        orderBaseUrl: process.env.ORDER_BASE_URL || "https://trade.brinto.in",
        orderAccessToken: request.headers.authorization?.slice(7),
        orderQuantity: process.env.ORDER_QUANTITY || "65",
      });
      return reply.code(200).send(result);
    } catch (error) {
      if (error.message?.includes("database") || error.code) {
        console.error("[liquidity-swing-api] Turso write failed", error);
        return reply.code(503).send({ error: "Unable to store swing analysis" });
      }
      console.error("[liquidity-swing-api] Option-chain or swing analysis failed", error);
      return reply.code(502).send({ error: "Unable to fetch swing analysis" });
    }
  });
}
