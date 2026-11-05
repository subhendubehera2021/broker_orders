import { readFile } from "node:fs/promises";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { AppConfig } from "./config.js";
import {
  KotakNeoClient,
  KotakNeoError,
  type AuthenticatedSession,
  type CancelOrderInput,
  type MarginCheckInput,
  type NiftyIndexTick,
  type NiftyOptionMarketInstrument,
  type NiftyOptionPriceTick,
  type OrderPositionConnectionState,
  type OrderPositionUpdate,
  type PlaceNiftyOptionOrderInput,
} from "./kotak-neo-client.js";
import { renderLoginPage } from "./login-page.js";
import { renderMarginPage } from "./margin-page.js";
import { renderOrdersPage } from "./orders-page.js";
import { renderOrderStreamPage } from "./order-stream-page.js";
import { renderNseFoScripMasterPage } from "./scrip-master-page.js";
import {
  filterUpcomingExpiryLabels,
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
  getScripMaster(): Promise<unknown>;
  getOrderBook?(session: AuthenticatedSession): Promise<unknown>;
  getPositions?(session: AuthenticatedSession): Promise<unknown>;
  cancelOrder?(session: AuthenticatedSession, input: CancelOrderInput): Promise<unknown>;
  streamOrderPositionUpdates?(
    session: AuthenticatedSession,
    onUpdate: (update: OrderPositionUpdate) => void,
    onState: (state: OrderPositionConnectionState) => void,
    onError: (error: Error) => void,
  ): () => void;
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
      ? new KotakNeoClient({
          ...config.kotakNeo,
          consumerKey: config.kotakNeo.consumerKey,
        }, fetch, undefined, config.kotakNeo.logKotakLoginResponses
          ? (stage, response) => {
              app.log.info(
                { stage, response },
                "Kotak Neo login response (sensitive fields redacted)",
              );
            }
          : undefined)
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

  app.get("/orders", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderOrdersPage());
  });

  app.get("/order-stream", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderOrderStreamPage());
  });

  app.register(async (api) => {
    await api.register(swagger, {
      openapi: {
        openapi: "3.0.3",
        info: {
          title: "Kotak Neo API",
          description: "Authentication and trading APIs for the Kotak Neo service.",
          version: "1.0.0",
        },
        tags: [
          { name: "Health", description: "Service health" },
          { name: "Authentication", description: "Kotak Neo session authentication" },
          { name: "Scrip Master", description: "Kotak Neo instrument master files" },
          { name: "Margin", description: "Kotak Neo margin estimates" },
          { name: "Options", description: "NIFTY contracts, market data, and option orders" },
          { name: "Orders", description: "Kotak Neo orders, positions, and activity streams" },
        ],
      },
    });
    await api.register(swaggerUi, {
      routePrefix: "/docs",
    });

    let session: AuthenticatedSession | undefined;
    const activeNiftyStreams = new Set<() => void>();
    const activeOrderStreams = new Set<() => void>();
    let niftyContractsLoad: Promise<NiftyOptionContract[]> | undefined;

    api.addHook("onClose", async () => {
      for (const closeStream of activeNiftyStreams) closeStream();
      for (const closeStream of activeOrderStreams) closeStream();
    });

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
      "/api/orders/stream",
      {
        schema: {
          tags: ["Orders"],
          summary: "Stream authenticated Kotak Neo order and position updates",
          response: {
            200: {
              type: "string",
              description: "Server-Sent Events containing connection, order, and position events.",
            },
            401: errorResponseSchema,
            503: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (!session) {
          return reply.code(401).send({ error: "Authenticate with Kotak Neo to stream activity" });
        }
        if (!client?.streamOrderPositionUpdates) {
          return reply.code(503).send({ error: "Kotak Neo order and position streaming is unavailable" });
        }
        if (!session.baseUrl) {
          return reply.code(503).send({
            error: "Kotak Neo did not return an order-stream base URL; sign in again",
          });
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
        response.write("retry: 3000\n\n");

        let closed = false;
        let stopStream: (() => void) | undefined;
        const keepAlive = setInterval(() => {
          if (!closed && !response.destroyed) response.write(": keep-alive\n\n");
        }, 20_000);
        const closeStream = () => {
          if (closed) return;
          closed = true;
          clearInterval(keepAlive);
          response.off("close", closeStream);
          activeOrderStreams.delete(closeStream);
          stopStream?.();
          if (!response.destroyed && !response.writableEnded) response.end();
        };
        const writeEvent = (name: string, value: unknown) => {
          if (!closed && !response.destroyed) {
            response.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
          }
        };
        activeOrderStreams.add(closeStream);
        response.once("close", closeStream);

        try {
          stopStream = client.streamOrderPositionUpdates(
            authenticatedSession,
            (update) => writeEvent(update.type, update.data),
            (state) => writeEvent("connection", { state }),
            (error) => {
              request.log.error(
                { errorName: error.name, errorMessage: error.message },
                "Kotak order and position stream reported an error",
              );
              writeEvent("stream-error", { error: error.message });
            },
          );
          if (closed) stopStream();
        } catch (error) {
          request.log.error(
            { errorName: error instanceof Error ? error.name : "UnknownError" },
            "Kotak order and position stream could not start",
          );
          writeEvent("stream-error", { error: "Kotak order and position stream could not start" });
          closeStream();
        }
        return reply;
      },
    );

    api.get(
      "/api/orders",
      {
        schema: {
          tags: ["Orders"],
          summary: "Get the authenticated Kotak Neo order book",
          response: {
            200: {
              type: "object",
              additionalProperties: true,
              description: "Kotak Neo order-book response.",
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
          return reply.code(401).send({ error: "Authenticate with Kotak Neo to view orders" });
        }
        if (!client?.getOrderBook) {
          return reply.code(503).send({ error: "Kotak Neo order-book API is not configured" });
        }
        if (!config.kotakNeo.orderBookPath) {
          return reply.code(503).send({
            error: "Set KOTAK_NEO_ORDER_BOOK_PATH to enable the order book",
          });
        }

        try {
          return await client.getOrderBook(session);
        } catch (error) {
          const statusCode = brokerRequestStatus(error);
          request.log.error(
            {
              statusCode,
              errorName: error instanceof Error ? error.name : "UnknownError",
              ...(error instanceof KotakNeoError
                ? {
                    ...(error.upstreamHttpStatusCode !== undefined
                      ? { upstreamStatusCode: error.upstreamHttpStatusCode }
                      : {}),
                    ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
                    ...(error.upstreamMessage
                      ? { upstreamErrorMessage: error.upstreamMessage }
                      : {}),
                    ...(error.upstreamStat ? { upstreamStat: error.upstreamStat } : {}),
                  }
                : {}),
            },
            "Kotak Neo order book request failed",
          );
          return reply.code(statusCode).send({
            error: error instanceof Error ? error.message : "Kotak Neo order book request failed",
          });
        }
      },
    );

    api.get(
      "/api/positions",
      {
        schema: {
          tags: ["Orders"],
          summary: "Get the authenticated Kotak Neo positions",
          response: {
            200: {
              type: "object",
              additionalProperties: true,
              description: "Kotak Neo positions response.",
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
          return reply.code(401).send({ error: "Authenticate with Kotak Neo to view positions" });
        }
        if (!client?.getPositions || !config.kotakNeo.positionsPath) {
          return reply.code(503).send({
            error: "Set KOTAK_NEO_POSITIONS_PATH to enable current positions",
          });
        }
        try {
          return await client.getPositions(session);
        } catch (error) {
          const statusCode = brokerRequestStatus(error);
          request.log.error(
            {
              statusCode,
              errorName: error instanceof Error ? error.name : "UnknownError",
              ...(error instanceof KotakNeoError
                ? {
                    ...(error.upstreamHttpStatusCode !== undefined
                      ? { upstreamStatusCode: error.upstreamHttpStatusCode }
                      : {}),
                    ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
                    ...(error.upstreamMessage
                      ? { upstreamErrorMessage: error.upstreamMessage }
                      : {}),
                    ...(error.upstreamStat ? { upstreamStat: error.upstreamStat } : {}),
                  }
                : {}),
            },
            "Kotak Neo positions request failed",
          );
          return reply.code(statusCode).send({
            error: error instanceof Error ? error.message : "Kotak Neo positions request failed",
          });
        }
      },
    );

    api.post<{ Params: { orderNumber: string } }>(
      "/api/orders/:orderNumber/cancel",
      {
        schema: {
          tags: ["Orders"],
          summary: "Cancel an open Kotak Neo order",
          params: {
            type: "object",
            required: ["orderNumber"],
            additionalProperties: false,
            properties: { orderNumber: { type: "string", pattern: "^\\d{1,32}$" } },
          },
          response: {
            200: {
              type: "object",
              additionalProperties: true,
              description: "Kotak Neo order cancellation response.",
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
          return reply.code(401).send({ error: "Authenticate with Kotak Neo before cancelling an order" });
        }
        if (!client?.getOrderBook || !client.cancelOrder) {
          return reply.code(503).send({ error: "Kotak Neo order cancellation is not configured" });
        }
        if (!config.kotakNeo.orderBookPath || !config.kotakNeo.cancelOrderPath) {
          return reply.code(503).send({
            error: "Set KOTAK_NEO_ORDER_BOOK_PATH and KOTAK_NEO_CANCEL_ORDER_PATH to enable cancellation",
          });
        }

        try {
          const orderNumber = request.params.orderNumber;
          const orders = orderBookRecords(await client.getOrderBook(session));
          const order = orders.find(
            (item) => orderRecordValue(item, ["nOrdNo", "orderId", "order_id"]) === orderNumber,
          );
          if (!order) {
            return reply.code(400).send({ error: "Order was not found in the current order book" });
          }
          if (!isOpenOrderRecord(order)) {
            return reply.code(400).send({ error: "Only open orders can be cancelled" });
          }
          const amo =
            orderRecordValue(order, ["ordGenTp", "orderGenerationType", "amo", "am"]).toUpperCase() ===
            "AMO"
              ? "YES"
              : orderRecordValue(order, ["amo", "am"]).toUpperCase() === "YES"
                ? "YES"
                : "NO";
          const tradingSymbol =
            orderRecordValue(order, ["trdSym", "tradingSymbol", "trading_symbol", "ts"]) || undefined;
          if (amo === "YES" && !tradingSymbol) {
            return reply.code(400).send({
              error: "Cannot cancel this AMO order because its trading symbol is missing",
            });
          }
          return await client.cancelOrder(session, {
            orderNumber,
            amo,
            ...(tradingSymbol ? { tradingSymbol } : {}),
          });
        } catch (error) {
          const statusCode = brokerRequestStatus(error);
          request.log.error(
            {
              statusCode,
              errorName: error instanceof Error ? error.name : "UnknownError",
              ...(error instanceof KotakNeoError
                ? {
                    ...(error.upstreamHttpStatusCode !== undefined
                      ? { upstreamStatusCode: error.upstreamHttpStatusCode }
                      : {}),
                    ...(error.upstreamCode ? { upstreamCode: error.upstreamCode } : {}),
                    ...(error.upstreamMessage
                      ? { upstreamErrorMessage: error.upstreamMessage }
                      : {}),
                    ...(error.upstreamStat ? { upstreamStat: error.upstreamStat } : {}),
                  }
                : {}),
            },
            "Kotak Neo order cancellation failed",
          );
          return reply.code(statusCode).send({
            error: error instanceof Error ? error.message : "Kotak Neo order cancellation failed",
          });
        }
      },
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
        for (const closeStream of activeOrderStreams) closeStream();
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
        for (const closeStream of activeOrderStreams) closeStream();
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
          const expiries = sortExpiryLabels(
            filterUpcomingExpiryLabels([...new Set(contracts.map(({ expiry }) => expiry))]),
          );
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

    api.post<{ Body: NiftyOptionOrderBody }>(
      "/api/options/nifty/order",
      {
        schema: {
          tags: ["Options"],
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

function orderBookRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => orderBookRecords(item));
  }
  if (!isObjectRecord(value)) return [];
  if (["nOrdNo", "orderId", "order_id"].some((key) => orderRecordValue(value, [key]))) {
    return [value];
  }
  return Object.values(value).flatMap((item) => orderBookRecords(item));
}

function orderRecordValue(order: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = order[key];
    if (typeof value === "string" || typeof value === "number") {
      if (String(value).trim()) return String(value).trim();
    }
  }
  return "";
}

function isOpenOrderRecord(order: Record<string, unknown>): boolean {
  const status = orderRecordValue(order, ["ordSt", "orderStatus", "status"])
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
  return [
    "open",
    "pending",
    "trigger pending",
    "validation pending",
    "open pending",
    "partially filled",
    "partial",
    "after market order req received",
    "modify pending",
    "cancel pending",
  ].includes(status);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
