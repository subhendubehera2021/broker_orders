import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { AppConfig } from "./config.js";
import {
  KotakNeoClient,
  KotakNeoError,
  type AuthenticatedSession,
  type PlaceNiftyOptionOrderInput,
} from "./kotak-neo-client.js";
import { renderLoginPage } from "./login-page.js";
import {
  parseNiftyOptionContracts,
  type NiftyOptionContract,
} from "./option-chain.js";

interface LoginBody {
  totp: string;
}

interface KotakLoginInput extends LoginBody {
  mobileNumber: string;
  ucc: string;
  mpin: string;
}

interface NiftyOptionOrderBody {
  expiry: string;
  tradingSymbol: string;
  transactionType: "B" | "S";
  quantity: string;
  product: "NRML" | "MIS" | "CNC" | "CO" | "BO" | "MTF";
  orderType: "L" | "MKT" | "SL" | "SL-M";
  price: string;
  validity: "DAY" | "IOC";
  amo?: "YES" | "NO";
  disclosedQuantity?: string;
  marketProtection?: string;
  triggerPrice?: string;
  tag?: string;
  squareOffType?: "Absolute" | "Ticks";
  stopLossType?: "Absolute" | "Ticks";
  stopLossValue?: string;
  squareOffValue?: string;
  trailingStopLoss?: "Y" | "N";
  trailingSlValue?: string;
  lastTradedPrice?: string;
}

interface AuthClient {
  login(input: KotakLoginInput): Promise<AuthenticatedSession>;
  placeNiftyOptionOrder?(
    session: AuthenticatedSession,
    input: PlaceNiftyOptionOrderInput,
  ): Promise<unknown>;
}

interface AppOptions {
  config: AppConfig;
  authClient?: AuthClient;
  optionChainCsvLoader?: () => Promise<string>;
}

export function buildApp({
  config,
  authClient,
  optionChainCsvLoader = readLocalNseFoMaster,
}: AppOptions): FastifyInstance {
  const app = Fastify({
    bodyLimit: 1024,
    logger: true,
    logController: new LogController({ disableRequestLogging: true }),
  });

  const client =
    authClient ??
    (config.kotakNeo.consumerKey
      ? new KotakNeoClient(
          {
            ...config.kotakNeo,
            consumerKey: config.kotakNeo.consumerKey,
          },
          fetch,
          undefined,
          config.kotakNeo.logKotakLoginResponses
            ? (stage, response) => {
                app.log.info(
                  { stage, response },
                  "Kotak Neo login response (sensitive fields redacted)",
                );
              }
            : undefined,
        )
      : undefined);

  app.get("/", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderLoginPage(config.kotakNeo));
  });

  app.register(async (api) => {
    await api.register(swagger, {
      openapi: {
        openapi: "3.0.3",
        info: {
          title: "Kotak Neo API",
          description: "Authentication and order placement APIs for Kotak Neo.",
          version: "1.0.0",
        },
        tags: [
          { name: "Health", description: "Service health" },
          { name: "Authentication", description: "Kotak Neo session authentication" },
          { name: "Orders", description: "Kotak Neo order placement" },
        ],
      },
    });
    await api.register(swaggerUi, {
      routePrefix: "/docs",
    });

    let session: AuthenticatedSession | undefined;
    let niftyContractsLoad: Promise<NiftyOptionContract[]> | undefined;

    const getNiftyContracts = (): Promise<NiftyOptionContract[]> => {
      niftyContractsLoad ??= optionChainCsvLoader()
        .then(parseNiftyOptionContracts)
        .catch((error: unknown) => {
          niftyContractsLoad = undefined;
          throw error;
        });
      return niftyContractsLoad;
    };

    api.get(
      "/health",
      {
        schema: {
          tags: ["Health"],
          summary: "Check service health",
          response: {
            200: {
              type: "object",
              required: ["status"],
              properties: { status: { type: "string", const: "ok" } },
            },
          },
        },
      },
      async () => ({ status: "ok" }),
    );

    api.get(
      "/api/auth/session",
      {
        schema: {
          tags: ["Authentication"],
          summary: "Check local authentication status",
          response: {
            200: {
              type: "object",
              required: ["authenticated", "orderReady"],
              properties: {
                authenticated: { type: "boolean" },
                orderReady: { type: "boolean" },
              },
            },
          },
        },
      },
      async () => ({
        authenticated: Boolean(session),
        orderReady: Boolean(session),
      }),
    );

    api.get(
      "/api/auth/session-details",
      {
        schema: {
          tags: ["Authentication"],
          summary: "Get stored Kotak Neo login session details",
          description:
            "Returns stored Kotak Neo login session details (sid, tradeToken, baseUrl, feedUrl, user, serverId, rid) for requests authenticated with a valid x-api-key header.",
          headers: {
            type: "object",
            properties: {
              "x-api-key": { type: "string" },
            },
          },
          response: {
            200: {
              type: "object",
              required: ["authenticated", "session"],
              properties: {
                authenticated: { type: "boolean", const: true },
                session: {
                  type: "object",
                  required: ["sid", "tradeToken"],
                  properties: {
                    sid: { type: "string" },
                    tradeToken: { type: "string" },
                    baseUrl: { type: "string" },
                    feedUrl: { type: "string" },
                    user: { type: "string" },
                    rid: { type: "string" },
                    serverId: { type: "string" },
                  },
                },
              },
            },
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const apiKeyHeader = request.headers["x-api-key"];
        const providedKey = typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : undefined;
        if (!providedKey || !validateApiKey(providedKey, config.apiKey)) {
          return reply.code(401).send({ error: "Invalid or missing x-api-key header" });
        }
        if (!session) {
          return reply.code(404).send({ error: "No active Kotak Neo session found" });
        }
        return {
          authenticated: true,
          session,
        };
      },
    );

    api.post<{ Body: LoginBody }>(
      "/api/auth/login",
      {
        schema: {
          tags: ["Authentication"],
          summary: "Authenticate with Kotak Neo",
          description:
            "Completes the TOTP login and MPIN validation flow using account credentials configured server-side. Broker tokens are kept server-side.",
          body: {
            type: "object",
            required: ["totp"],
            additionalProperties: false,
            properties: {
              totp: { type: "string", pattern: "^\\d{6}$" },
            },
          },
          response: {
            200: {
              type: "object",
              required: ["authenticated"],
              properties: { authenticated: { type: "boolean", const: true } },
            },
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
            504: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { consumerKey, mobileNumber, ucc, mpin } = config.kotakNeo;
        if (!client || !consumerKey || !mobileNumber || !ucc || !mpin) {
          return reply.code(503).send({ error: "Kotak Neo login settings are not configured" });
        }

        session = undefined;
        try {
          session = await client.login({
            mobileNumber,
            ucc,
            mpin,
            totp: request.body.totp,
          });
          return { authenticated: true };
        } catch (error) {
          const statusCode = authenticationErrorStatus(error);
          request.log.error(
            { statusCode, errorName: error instanceof Error ? error.name : "UnknownError" },
            "Kotak Neo authentication failed",
          );
          return reply.code(statusCode).send({
            error: "Kotak Neo authentication could not be completed",
          });
        }
      },
    );

    api.post(
      "/api/auth/logout",
      {
        schema: {
          tags: ["Authentication"],
          summary: "Clear local authentication state",
          description: "Discards locally held session tokens. It does not revoke the broker-side session.",
          response: {
            200: {
              type: "object",
              required: ["authenticated"],
              properties: { authenticated: { type: "boolean", const: false } },
            },
          },
        },
      },
      async () => {
        session = undefined;
        return { authenticated: false };
      },
    );

    api.post<{ Body: NiftyOptionOrderBody }>(
      "/api/options/nifty/order",
      {
        schema: {
          tags: ["Orders"],
          summary: "Place a live NIFTY option order",
          description:
            "Submits a live NIFTY option order. Supports limit, market, stop-limit, stop-market, cover, and bracket orders with MIS, NRML, CO, or BO products. Quantity must be a whole number of lots.",
          body: {
            type: "object",
            required: [
              "expiry",
              "tradingSymbol",
              "transactionType",
              "quantity",
              "product",
              "orderType",
              "price",
              "validity",
            ],
            additionalProperties: false,
            properties: {
              expiry: { type: "string", pattern: "^\\d{2}[A-Z]{3}\\d{4}$" },
              tradingSymbol: { type: "string", minLength: 1, maxLength: 64 },
              transactionType: { type: "string", enum: ["B", "S"] },
              quantity: { type: "string", pattern: "^[1-9]\\d{0,7}$" },
              product: { type: "string", enum: ["NRML", "MIS", "CNC", "CO", "BO", "MTF"] },
              orderType: { type: "string", enum: ["L", "MKT", "SL", "SL-M"] },
              price: { type: "string", pattern: "^\\d+(\\.\\d{1,4})?$" },
              validity: { type: "string", enum: ["DAY", "IOC"] },
              amo: { type: "string", enum: ["YES", "NO"] },
              disclosedQuantity: { type: "string", pattern: "^\\d{1,8}$" },
              marketProtection: { type: "string", pattern: "^\\d+(\\.\\d{1,2})?$" },
              triggerPrice: { type: "string", pattern: "^\\d+(\\.\\d{1,4})?$" },
              tag: { type: "string", minLength: 1, maxLength: 20 },
              squareOffType: { type: "string", enum: ["Absolute", "Ticks"] },
              stopLossType: { type: "string", enum: ["Absolute", "Ticks"] },
              stopLossValue: { type: "string", pattern: "^\\d+(\\.\\d{1,4})?$" },
              squareOffValue: { type: "string", pattern: "^\\d+(\\.\\d{1,4})?$" },
              trailingStopLoss: { type: "string", enum: ["Y", "N"] },
              trailingSlValue: { type: "string", pattern: "^\\d+(\\.\\d{1,4})?$" },
              lastTradedPrice: { type: "string", pattern: "^\\d+(\\.\\d{1,4})?$" },
            },
          },
          response: {
            200: {
              type: "object",
              additionalProperties: true,
              description: "Kotak Neo order submission response.",
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
            504: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!session) {
          return reply.code(401).send({ error: "Authenticate with Kotak Neo before placing an order" });
        }
        if (
          !client?.placeNiftyOptionOrder ||
          !config.kotakNeo.placeOrderPath ||
          !config.kotakNeo.orderSource
        ) {
          return reply.code(503).send({
            error:
              "Kotak Neo order API is not configured; set KOTAK_NEO_PLACE_ORDER_PATH and KOTAK_NEO_ORDER_SOURCE",
          });
        }
        const authenticatedSession = session;
        const body = request.body;
        const isMarketOrder = body.orderType === "MKT" || body.orderType === "SL-M";
        const isStopOrder = body.orderType === "SL" || body.orderType === "SL-M";
        const isCoverOrder = body.product === "CO";
        if (
          isMarketOrder !== (Number(body.price) === 0) ||
          (!isMarketOrder && Number(body.price) <= 0) ||
          (isStopOrder || isCoverOrder) !==
            (body.triggerPrice !== undefined && Number(body.triggerPrice) > 0)
        ) {
          return reply.code(400).send({
            error: "Price and trigger price do not match the order type and product",
          });
        }
        if (body.product === "CNC" || body.product === "MTF") {
          return reply.code(400).send({
            error: `${body.product} is not supported for NIFTY F&O contracts; use MIS, NRML, CO, or BO`,
          });
        }
        if (
          body.product === "BO" &&
          (!body.squareOffType ||
            !body.stopLossType ||
            !body.stopLossValue ||
            Number(body.stopLossValue) <= 0 ||
            !body.squareOffValue ||
            Number(body.squareOffValue) <= 0 ||
            !body.trailingStopLoss ||
            body.trailingSlValue === undefined ||
            (body.trailingStopLoss === "Y" && Number(body.trailingSlValue) <= 0))
        ) {
          return reply.code(400).send({
            error: "Bracket orders require positive square-off and stop-loss values and trailing settings",
          });
        }
        const invalidStopLimitPrice =
          body.orderType === "SL" &&
          (body.transactionType === "B"
            ? Number(body.price) < Number(body.triggerPrice)
            : Number(body.price) > Number(body.triggerPrice));
        if (invalidStopLimitPrice) {
          return reply.code(400).send({
            error:
              body.transactionType === "B"
                ? "BUY stop-limit price must be greater than or equal to its trigger price"
                : "SELL stop-limit price must be less than or equal to its trigger price",
          });
        }
        if (body.disclosedQuantity && Number(body.disclosedQuantity) > Number(body.quantity)) {
          return reply.code(400).send({ error: "Disclosed quantity cannot exceed order quantity" });
        }

        let brokerRequestStarted = false;
        try {
          const contract = (await getNiftyContracts()).find(
            ({ expiry, tradingSymbol }) =>
              expiry === body.expiry && tradingSymbol === body.tradingSymbol,
          );
          if (!contract) {
            return reply.code(400).send({
              error: "NIFTY option contract was not found for the selected expiry",
            });
          }
          const quantity = Number(body.quantity);
          const lotSize = Number(contract.lotSize);
          if (!Number.isSafeInteger(lotSize) || lotSize < 1 || quantity % lotSize !== 0) {
            return reply.code(400).send({
              error: "Order quantity must be a whole number of lots for this contract",
            });
          }
          const expiryDate = Date.parse(
            `${body.expiry.slice(0, 2)} ${body.expiry.slice(2, 5)} ${body.expiry.slice(5)} UTC`,
          );
          const today = Date.parse(`${new Date().toISOString().slice(0, 10)} UTC`);
          if (!Number.isFinite(expiryDate) || expiryDate < today) {
            return reply.code(400).send({ error: "Cannot place an order for an expired contract" });
          }

          brokerRequestStarted = true;
          return await client.placeNiftyOptionOrder(authenticatedSession, {
            tradingSymbol: contract.tradingSymbol,
            instrumentToken: contract.instrumentToken,
            transactionType: body.transactionType,
            quantity: body.quantity,
            product: body.product,
            orderType: body.orderType,
            price: body.price,
            validity: body.validity,
            amo: body.amo ?? "NO",
            disclosedQuantity: body.disclosedQuantity ?? "0",
            marketProtection: body.marketProtection ?? "0",
            triggerPrice: body.triggerPrice ?? "0",
            ...(body.tag ? { tag: body.tag } : {}),
            ...(body.squareOffType ? { squareOffType: body.squareOffType } : {}),
            ...(body.stopLossType ? { stopLossType: body.stopLossType } : {}),
            ...(body.stopLossValue ? { stopLossValue: body.stopLossValue } : {}),
            ...(body.squareOffValue ? { squareOffValue: body.squareOffValue } : {}),
            ...(body.trailingStopLoss ? { trailingStopLoss: body.trailingStopLoss } : {}),
            ...(body.trailingSlValue !== undefined ? { trailingSlValue: body.trailingSlValue } : {}),
            ...(body.lastTradedPrice ? { lastTradedPrice: body.lastTradedPrice } : {}),
          });
        } catch (error) {
          const statusCode = orderRequestStatus(error);
          const outcomeUncertain =
            brokerRequestStarted &&
            (statusCode === 502 || statusCode === 503 || statusCode === 504);
          request.log.error(
            {
              statusCode,
              errorName: error instanceof Error ? error.name : "UnknownError",
              ...(error instanceof Error ? { errorMessage: error.message } : {}),
              ...(error instanceof KotakNeoError
                ? {
                    ...(error.upstreamMessage
                      ? { upstreamErrorMessage: error.upstreamMessage }
                      : {}),
                    ...(error.upstreamHttpStatusCode !== undefined
                      ? { upstreamStatusCode: error.upstreamHttpStatusCode }
                      : {}),
                    ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
                    ...(error.upstreamStat ? { upstreamStat: error.upstreamStat } : {}),
                  }
                : {}),
            },
            "Kotak Neo NIFTY option order failed",
          );
          return reply.code(statusCode).send({
            error: outcomeUncertain
              ? "Order outcome could not be confirmed; check your Kotak Neo order book before retrying"
              : error instanceof KotakNeoError
                ? error.message
                : "NIFTY option order could not be prepared",
          });
        }
      },
    );
  });

  return app;
}

async function readLocalNseFoMaster(): Promise<string> {
  try {
    return await readFile(new URL("../src/nse_fo.csv", import.meta.url), "utf8");
  } catch {
    throw new KotakNeoError("Local NSE F&O Scrip Master file could not be read", 503);
  }
}

const errorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: { error: { type: "string" } },
} as const;

function authenticationErrorStatus(error: unknown): 401 | 429 | 502 | 503 | 504 {
  if (!(error instanceof KotakNeoError)) {
    return 502;
  }
  if (error.statusCode === 400 || error.statusCode === 401) {
    return 401;
  }
  if (error.statusCode === 429) {
    return 429;
  }
  if (error.statusCode === 503 || error.statusCode === 504) {
    return error.statusCode;
  }
  return 502;
}

function orderRequestStatus(error: unknown): 400 | 401 | 429 | 502 | 503 | 504 {
  if (!(error instanceof KotakNeoError)) return 502;
  if (error.statusCode === 400) return 400;
  if (error.statusCode === 401 || error.statusCode === 403) return 401;
  if (
    error.statusCode === 429 ||
    error.statusCode === 502 ||
    error.statusCode === 503 ||
    error.statusCode === 504
  ) {
    return error.statusCode;
  }
  return 502;
}

function validateApiKey(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  return (
    providedBuf.length === expectedBuf.length &&
    timingSafeEqual(providedBuf, expectedBuf)
  );
}
