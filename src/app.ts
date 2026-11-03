import { readFile } from "node:fs/promises";
import Fastify, { type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { AppConfig } from "./config.js";
import {
  KotakNeoClient,
  KotakNeoError,
  type AuthenticatedSession,
  type MarginCheckInput,
  type NiftyIndexTick,
  type NiftyOptionMarketInstrument,
  type NiftyOptionPriceTick,
} from "./kotak-neo-client.js";
import { renderLoginPage } from "./login-page.js";
import { renderMarginPage } from "./margin-page.js";
import { renderNseFoScripMasterPage } from "./scrip-master-page.js";
import {
  parseNiftyOptionContracts,
  selectNearbyNiftyOptionContracts,
  sortExpiryLabels,
  type NiftyOptionContract,
} from "./option-chain.js";
import { renderOptionChainPage } from "./option-chain-page.js";

interface LoginBody {
  totp: string;
}

interface KotakLoginInput extends LoginBody {
  mobileNumber: string;
  ucc: string;
  mpin: string;
}

interface AuthClient {
  login(input: KotakLoginInput): Promise<AuthenticatedSession>;
  getScripMaster(): Promise<unknown>;
  getNseFoScripMaster?(): Promise<string>;
  streamNiftyIndexPrice?(
    session: AuthenticatedSession,
    onPrice: (tick: NiftyIndexTick) => void,
    onError: (error: Error) => void,
  ): () => void;
  streamNiftyMarketData?(
    session: AuthenticatedSession,
    optionInstruments: NiftyOptionMarketInstrument[],
    selectOptions: (spotPrice: number) => NiftyOptionMarketInstrument[],
    onIndexPrice: (tick: NiftyIndexTick) => void,
    onOptionPrice: (tick: NiftyOptionPriceTick) => void,
    onError: (error: Error) => void,
    onConnected?: () => void,
  ): () => void;
  checkMargin?(session: AuthenticatedSession, input: MarginCheckInput): Promise<unknown>;
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
  });

  const client =
    authClient ??
    (config.kotakNeo.consumerKey
      ? new KotakNeoClient({
          ...config.kotakNeo,
          consumerKey: config.kotakNeo.consumerKey,
        })
      : undefined);

  app.get("/", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderLoginPage(config.kotakNeo));
  });

  app.get("/margin", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderMarginPage());
  });

  app.get("/scrip-master", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderNseFoScripMasterPage());
  });

  app.get("/option-chain", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderOptionChainPage());
  });

  app.register(async (api) => {
    await api.register(swagger, {
      openapi: {
        openapi: "3.0.3",
        info: {
          title: "Kotak Neo API",
          description: "Authentication and Scrip Master APIs for the Kotak Neo trading service.",
          version: "1.0.0",
        },
        tags: [
          { name: "Health", description: "Service health" },
          { name: "Authentication", description: "Kotak Neo session authentication" },
          { name: "Scrip Master", description: "Kotak Neo instrument master files" },
          { name: "Margin", description: "Kotak Neo margin estimates" },
          { name: "Options", description: "NIFTY contracts and live index market data" },
        ],
      },
    });
    await api.register(swaggerUi, {
      routePrefix: "/docs",
    });

    let session: AuthenticatedSession | undefined;
    const activeNiftyStreams = new Set<() => void>();
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
              required: ["authenticated"],
              properties: { authenticated: { type: "boolean" } },
            },
          },
        },
      },
      async () => ({
        authenticated: Boolean(session),
      }),
    );

    api.get<{ Querystring: { expiry?: string } }>(
      "/api/market/nifty/stream",
      {
        schema: {
          tags: ["Options"],
          summary: "Stream live NIFTY and optional option prices",
          querystring: {
            type: "object",
            additionalProperties: false,
            properties: { expiry: { type: "string", pattern: "^\\d{2}[A-Z]{3}\\d{4}$" } },
          },
          response: {
            200: {
              type: "string",
              description:
                "Server-Sent Events with NIFTY index prices and, when expiry is supplied, current option prices.",
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!session) {
          return reply.code(401).send({ error: "Sign in to Kotak Neo to stream live market prices" });
        }

        const expiry = request.query.expiry;
        let optionContracts: NiftyOptionContract[] = [];
        if (expiry) {
          try {
            optionContracts = (await getNiftyContracts()).filter(
              (contract) => contract.expiry === expiry,
            );
            if (optionContracts.length === 0) {
              return reply.code(400).send({ error: "No NIFTY option contracts found for that expiry" });
            }
          } catch (error) {
            const statusCode = brokerRequestStatus(error);
            request.log.error(
              {
                statusCode,
                errorName: error instanceof Error ? error.name : "UnknownError",
                ...(error instanceof KotakNeoError
                  ? { errorMessage: error.message, upstreamStatusCode: error.statusCode }
                  : {}),
              },
              "NIFTY option stream contracts could not be loaded",
            );
            return reply.code(statusCode).send({
              error:
                error instanceof KotakNeoError
                  ? error.message
                  : "NIFTY option stream contracts could not be loaded",
            });
          }
        }
        if (
          expiry
            ? !client?.streamNiftyMarketData
            : !client?.streamNiftyIndexPrice
        ) {
          return reply.code(503).send({ error: "Kotak Neo market-data WebSocket is not configured" });
        }

        const authenticatedSession = session;
        reply.hijack();
        const response = reply.raw;
        response.writeHead(200, {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream; charset=utf-8",
          "X-Accel-Buffering": "no",
        });
        response.write("retry: 5000\n\n");

        let closed = false;
        let stopFeed: (() => void) | undefined;
        const keepAlive = setInterval(() => {
          if (!closed && !response.destroyed) response.write(": keep-alive\n\n");
        }, 20_000);
        const closeStream = () => {
          if (closed) return;
          closed = true;
          clearInterval(keepAlive);
          response.off("close", closeStream);
          activeNiftyStreams.delete(closeStream);
          stopFeed?.();
          if (!response.destroyed && !response.writableEnded) response.end();
        };
        const writeEvent = (name: string, value: unknown) => {
          if (!closed && !response.destroyed) {
            response.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
          }
        };
        activeNiftyStreams.add(closeStream);
        response.once("close", closeStream);

        try {
          if (expiry && client?.streamNiftyMarketData) {
            const optionInstruments = optionContracts.map(({ instrumentToken, tradingSymbol }) => ({
              instrumentToken,
              tradingSymbol,
            }));
            stopFeed = client.streamNiftyMarketData(
              authenticatedSession,
              optionInstruments,
              (spotPrice) =>
                selectNearbyNiftyOptionContracts(optionContracts, spotPrice).map(
                  ({ instrumentToken, tradingSymbol }) => ({ instrumentToken, tradingSymbol }),
                ),
              (tick) => writeEvent("price", tick),
              (tick) => writeEvent("option-price", tick),
              (error) => {
                request.log.error(
                  { errorName: error.name, errorMessage: error.message },
                  "NIFTY option market-data WebSocket stream failed",
                );
                writeEvent("market-error", { error: error.message });
                closeStream();
              },
              () => writeEvent("feed-connected", { status: "live" }),
            );
          } else if (client?.streamNiftyIndexPrice) {
            stopFeed = client.streamNiftyIndexPrice(
              authenticatedSession,
              (tick) => writeEvent("price", tick),
              (error) => {
                request.log.error(
                  { errorName: error.name, errorMessage: error.message },
                  "NIFTY live WebSocket stream failed",
                );
                writeEvent("market-error", { error: error.message });
                closeStream();
              },
            );
          }
          if (closed) stopFeed?.();
        } catch (error) {
          request.log.error(
            { errorName: error instanceof Error ? error.name : "UnknownError" },
            "NIFTY live WebSocket stream could not start",
          );
          writeEvent("market-error", { error: "NIFTY live price stream could not start" });
          closeStream();
        }
        return reply;
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

        for (const closeStream of activeNiftyStreams) closeStream();
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
        for (const closeStream of activeNiftyStreams) closeStream();
        session = undefined;
        return { authenticated: false };
      },
    );

    api.get(
      "/api/scrip-master",
      {
        schema: {
          tags: ["Scrip Master"],
          summary: "Get Scrip Master file paths",
          description:
            "Returns the production Scrip Master file paths from Kotak Neo using the configured API token.",
          response: {
            200: {
              type: "object",
              additionalProperties: true,
              description: "Kotak Neo Scrip Master response.",
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
        if (!client || !config.kotakNeo.consumerKey) {
          return reply.code(503).send({ error: "Kotak Neo API token is not configured" });
        }

        try {
          return await client.getScripMaster();
        } catch (error) {
          const statusCode = authenticationErrorStatus(error);
          request.log.error(
            { statusCode, errorName: error instanceof Error ? error.name : "UnknownError" },
            "Kotak Neo Scrip Master request failed",
          );
          return reply.code(statusCode).send({
            error: "Kotak Neo Scrip Master request could not be completed",
          });
        }
      },
    );

    api.get(
      "/api/scrip-master/nse-fo",
      {
        schema: {
          tags: ["Scrip Master"],
          summary: "Download NSE F&O Scrip Master CSV",
          description:
            "Returns Kotak Neo's NSE F&O instrument master CSV. The file is fetched from the official Scrip Master host and limited to 100 MiB.",
          response: {
            200: {
              description: "NSE F&O Scrip Master CSV.",
              content: {
                "text/csv": {
                  schema: { type: "string" },
                },
              },
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
        if (!client || !config.kotakNeo.consumerKey) {
          return reply.code(503).send({ error: "Kotak Neo API token is not configured" });
        }
        if (!client.getNseFoScripMaster) {
          return reply.code(503).send({ error: "NSE F&O Scrip Master is not configured" });
        }

        try {
          const csv = await client.getNseFoScripMaster();
          return reply
            .header("Cache-Control", "no-store")
            .header("Content-Disposition", 'inline; filename="nse_fo.csv"')
            .type("text/csv; charset=utf-8")
            .send(csv);
        } catch (error) {
          const statusCode = authenticationErrorStatus(error);
          request.log.error(
            {
              statusCode,
              errorName: error instanceof Error ? error.name : "UnknownError",
              ...(error instanceof KotakNeoError
                ? { errorMessage: error.message, upstreamStatusCode: error.statusCode }
                : {}),
            },
            "Kotak Neo NSE F&O Scrip Master request failed",
          );
          return reply.code(statusCode).send({
            error:
              error instanceof KotakNeoError
                ? error.message
                : "Kotak Neo NSE F&O Scrip Master could not be loaded",
          });
        }
      },
    );

    api.get(
      "/api/options/nifty/expiries",
      {
        schema: {
          tags: ["Options"],
          summary: "List available NIFTY option expiries from the local NSE F&O file",
          response: {
            200: {
              type: "object",
              required: ["expiries"],
              properties: { expiries: { type: "array", items: { type: "string" } } },
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
        try {
          const contracts = await getNiftyContracts();
          const expiries = sortExpiryLabels([...new Set(contracts.map(({ expiry }) => expiry))]);
          return { expiries };
        } catch (error) {
          const statusCode = brokerRequestStatus(error);
          request.log.error(
            {
              statusCode,
              errorName: error instanceof Error ? error.name : "UnknownError",
              ...(error instanceof KotakNeoError
                ? { errorMessage: error.message, upstreamStatusCode: error.statusCode }
                : {}),
            },
            "NIFTY option expiries request failed",
          );
          return reply.code(statusCode).send({
            error: error instanceof KotakNeoError ? error.message : "NIFTY option expiries could not be loaded",
          });
        }
      },
    );

    api.get<{ Querystring: { expiry: string } }>(
      "/api/options/nifty/chain",
      {
        schema: {
          tags: ["Options"],
          summary: "Get NIFTY option contracts from the local NSE F&O file",
          querystring: {
            type: "object",
            required: ["expiry"],
            additionalProperties: false,
            properties: { expiry: { type: "string", pattern: "^\\d{2}[A-Z]{3}\\d{4}$" } },
          },
          response: {
            200: {
              type: "object",
              required: ["expiry", "contracts"],
              properties: {
                expiry: { type: "string" },
                contracts: { type: "array", items: { type: "object", additionalProperties: true } },
              },
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
        try {
          const contracts = await getNiftyContracts();
          const selected = contracts.filter(({ expiry }) => expiry === request.query.expiry);
          if (selected.length === 0) {
            return reply.code(400).send({ error: "No NIFTY option contracts found for that expiry" });
          }

          return { expiry: request.query.expiry, contracts: selected };
        } catch (error) {
          const statusCode = brokerRequestStatus(error);
          request.log.error(
            {
              statusCode,
              errorName: error instanceof Error ? error.name : "UnknownError",
              ...(error instanceof KotakNeoError
                ? { errorMessage: error.message, upstreamStatusCode: error.statusCode }
                : {}),
            },
            "NIFTY option chain request failed",
          );
          return reply.code(statusCode).send({
            error: error instanceof KotakNeoError ? error.message : "NIFTY option chain could not be loaded",
          });
        }
      },
    );

    api.post<{ Body: MarginCheckInput }>(
      "/api/margin",
      {
        schema: {
          tags: ["Margin"],
          summary: "Check required margin",
          description:
            "Requests a margin estimate from Kotak Neo for the supplied order parameters. This does not place an order.",
          body: {
            type: "object",
            required: [
              "brkName",
              "brnchId",
              "exSeg",
              "prc",
              "prcTp",
              "prod",
              "qty",
              "tok",
              "trnsTp",
            ],
            additionalProperties: false,
            properties: {
              brkName: { type: "string", minLength: 1, maxLength: 20 },
              brnchId: { type: "string", minLength: 1, maxLength: 32 },
              exSeg: { type: "string", minLength: 1, maxLength: 20 },
              prc: { type: "string", pattern: "^\\d+(\\.\\d+)?$" },
              prcTp: { type: "string", minLength: 1, maxLength: 10 },
              prod: { type: "string", minLength: 1, maxLength: 20 },
              qty: { type: "string", pattern: "^[1-9]\\d*$" },
              tok: { type: "string", minLength: 1, maxLength: 32 },
              trnsTp: { type: "string", enum: ["B", "S"] },
            },
          },
          response: {
            200: {
              type: "object",
              additionalProperties: true,
              description: "Kotak Neo margin response.",
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
        if (!session) {
          return reply.code(401).send({ error: "Authenticate with Kotak Neo before checking margin" });
        }
        if (!client?.checkMargin) {
          return reply.code(503).send({ error: "Kotak Neo API client is not configured" });
        }

        try {
          return await client.checkMargin(session, request.body);
        } catch (error) {
          const statusCode = authenticationErrorStatus(error);
          request.log.error(
            { statusCode, errorName: error instanceof Error ? error.name : "UnknownError" },
            "Kotak Neo margin check failed",
          );
          return reply.code(statusCode).send({
            error: "Kotak Neo margin check could not be completed",
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

function brokerRequestStatus(error: unknown): 400 | 401 | 429 | 502 | 503 | 504 {
  if (!(error instanceof KotakNeoError)) return 502;
  if (
    error.statusCode === 400 ||
    error.statusCode === 401 ||
    error.statusCode === 429 ||
    error.statusCode === 502 ||
    error.statusCode === 503 ||
    error.statusCode === 504
  ) {
    return error.statusCode;
  }
  return 502;
}
