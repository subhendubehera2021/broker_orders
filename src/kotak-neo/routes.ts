import { readFile } from "node:fs/promises";
import type {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandlerMethod,
  RouteShorthandOptions,
} from "fastify";
import type { AppConfig } from "../config.js";
import { errorResponseSchema, validateApiKey } from "../http-utils.js";
import {
  KotakNeoError,
  type AuthenticatedSession,
  type CancelOrderInput,
  type GetHistoricalDataInput,
  type HistoricalDataResponse,
  type PlaceNiftyOptionOrderInput,
} from "./client.js";
import { parseNiftyOptionContracts, type NiftyOptionContract } from "../option-chain.js";

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

interface BuySlLimitOrderBody {
  tradingSymbol: string;
  quantity: string;
  price?: string;
  triggerPrice?: string;
  product?: "MIS" | "NRML";
  amo?: "YES" | "NO";
  tag?: string;
}

interface SellSlLimitOrderBody {
  tradingSymbol: string;
  quantity: string;
  price?: string;
  triggerPrice?: string;
  product?: "MIS" | "NRML";
  amo?: "YES" | "NO";
  tag?: string;
}

interface CancelOrderBody {
  orderNumber?: string;
  on?: string;
  orderNo?: string;
  amo?: "YES" | "NO";
  tradingSymbol?: string;
}

interface HistoricalDataQuery {
  symbol?: string;
  neoSymbol?: string;
  neosymbol?: string;
  exchangeSegment?: string;
  es?: string;
  instrumentToken?: string;
  token?: string;
  tradingSymbol?: string;
  fromDate?: string;
  fromdate?: string;
  toDate?: string;
  todate?: string;
  interval?: string;
}

export interface KotakNeoRouteClient {
  login(input: KotakLoginInput): Promise<AuthenticatedSession>;
  placeNiftyOptionOrder?(
    session: AuthenticatedSession,
    input: PlaceNiftyOptionOrderInput,
  ): Promise<unknown>;
  cancelOrder?(session: AuthenticatedSession, input: CancelOrderInput): Promise<unknown>;
  getHistoricalData?(
    session: AuthenticatedSession | undefined,
    input: GetHistoricalDataInput,
  ): Promise<HistoricalDataResponse>;
}

export interface KotakNeoRoutesOptions {
  config: AppConfig;
  authClient?: KotakNeoRouteClient;
  optionChainCsvLoader?: () => Promise<string>;
}

export function registerKotakNeoRoutes(
  api: FastifyInstance,
  {
    config,
    authClient: client,
    optionChainCsvLoader = readLocalNseFoMaster,
  }: KotakNeoRoutesOptions,
): void {
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

    registerKotakRoute(api, "GET",
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

    registerKotakRoute(api, "GET",
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

    registerKotakRoute<{ Body: LoginBody }>(api, "POST",
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

    registerKotakRoute(api, "POST",
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

    registerKotakRoute<{ Body: NiftyOptionOrderBody }>(api, "POST",
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

    registerKotakRoute<{ Body: BuySlLimitOrderBody }>(api, "POST",
      "/api/orders/buy-sl-limit",
      {
        schema: {
          tags: ["Orders"],
          summary: "Place a simplified BUY SL-Limit order with auto 0.10 price difference and auto-AMO",
          description:
            "Places a BUY Stop-Limit (SL) order with minimal required body parameters (tradingSymbol, quantity, and either triggerPrice or price). If triggerPrice is provided, price is automatically calculated as triggerPrice + 0.10. Auto-detects After Market Orders (AMO: YES) outside regular Indian market hours (3:30 PM – 9:00 AM IST and weekends).",
          body: {
            type: "object",
            required: ["tradingSymbol", "quantity"],
            additionalProperties: false,
            properties: {
              tradingSymbol: { type: "string", minLength: 1, maxLength: 64 },
              quantity: { type: "string", pattern: "^[1-9]\\d{0,7}$" },
              triggerPrice: {
                type: "string",
                pattern: "^\\d+(\\.\\d{1,4})?$",
                description: "Stop trigger price (limit price is automatically calculated as triggerPrice + 0.10 if price is omitted)",
              },
              price: {
                type: "string",
                pattern: "^\\d+(\\.\\d{1,4})?$",
                description: "Limit price (optional; if omitted, computed automatically from triggerPrice)",
              },
              product: { type: "string", enum: ["MIS", "NRML"], default: "MIS" },
              amo: {
                type: "string",
                enum: ["YES", "NO"],
                description: "Auto-detected if omitted (YES after 3:30 PM, before 9:00 AM IST, or weekends)",
              },
              tag: { type: "string", minLength: 1, maxLength: 20 },
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
        let triggerNum: number;
        let priceNum: number;

        if (body.triggerPrice !== undefined && Number(body.triggerPrice) > 0) {
          triggerNum = Number(body.triggerPrice);
          priceNum = Math.round((triggerNum + 0.10) * 100) / 100;
        } else if (body.price !== undefined && Number(body.price) > 0) {
          priceNum = Number(body.price);
          triggerNum = Math.round((priceNum - 0.10) * 100) / 100;
        } else {
          return reply.code(400).send({
            error: "Provide either triggerPrice or price for the BUY SL-Limit order",
          });
        }

        if (triggerNum <= 0 || priceNum <= 0) {
          return reply.code(400).send({ error: "Trigger price and price must be positive numbers" });
        }

        let brokerRequestStarted = false;
        try {
          const contract = (await getNiftyContracts()).find(
            ({ tradingSymbol }) => tradingSymbol.toUpperCase() === body.tradingSymbol.toUpperCase(),
          );
          if (!contract) {
            return reply.code(400).send({
              error: `Contract for trading symbol ${body.tradingSymbol} was not found in Scrip Master`,
            });
          }
          const quantity = Number(body.quantity);
          const lotSize = Number(contract.lotSize);
          if (!Number.isSafeInteger(lotSize) || lotSize < 1 || quantity % lotSize !== 0) {
            return reply.code(400).send({
              error: "Order quantity must be a whole number of lots for this contract",
            });
          }

          brokerRequestStarted = true;
          const amo = body.amo ?? (isAfterMarketHours() ? "YES" : "NO");
          return await client.placeNiftyOptionOrder(authenticatedSession, {
            tradingSymbol: contract.tradingSymbol,
            instrumentToken: contract.instrumentToken,
            transactionType: "B",
            quantity: body.quantity,
            product: body.product ?? "MIS",
            orderType: "SL",
            price: priceNum.toFixed(2),
            validity: "DAY",
            amo,
            disclosedQuantity: "0",
            marketProtection: "0",
            triggerPrice: triggerNum.toFixed(2),
            ...(body.tag ? { tag: body.tag } : {}),
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
            },
            "Kotak Neo BUY SL-Limit order failed",
          );
          return reply.code(statusCode).send({
            error: outcomeUncertain
              ? "Order outcome could not be confirmed; check your Kotak Neo order book before retrying"
              : error instanceof KotakNeoError
                ? error.message
                : "BUY SL-Limit order could not be prepared",
          });
        }
      },
    );

    registerKotakRoute<{ Body: SellSlLimitOrderBody }>(api, "POST",
      "/api/orders/sell-sl-limit",
      {
        schema: {
          tags: ["Orders"],
          summary: "Place a simplified SELL SL-Limit order with auto 0.10 price difference and auto-AMO",
          description:
            "Places a SELL Stop-Limit (SL) order with minimal required body parameters (tradingSymbol, quantity, and either triggerPrice or price). If triggerPrice is provided, price is automatically calculated as triggerPrice - 0.10. Auto-detects After Market Orders (AMO: YES) outside regular Indian market hours (3:30 PM – 9:00 AM IST and weekends).",
          body: {
            type: "object",
            required: ["tradingSymbol", "quantity"],
            additionalProperties: false,
            properties: {
              tradingSymbol: { type: "string", minLength: 1, maxLength: 64 },
              quantity: { type: "string", pattern: "^[1-9]\\d{0,7}$" },
              triggerPrice: {
                type: "string",
                pattern: "^\\d+(\\.\\d{1,4})?$",
                description: "Stop trigger price (limit price is automatically calculated as triggerPrice - 0.10 if price is omitted)",
              },
              price: {
                type: "string",
                pattern: "^\\d+(\\.\\d{1,4})?$",
                description: "Limit price (optional; if omitted, computed automatically from triggerPrice)",
              },
              product: { type: "string", enum: ["MIS", "NRML"], default: "MIS" },
              amo: {
                type: "string",
                enum: ["YES", "NO"],
                description: "Auto-detected if omitted (YES after 3:30 PM, before 9:00 AM IST, or weekends)",
              },
              tag: { type: "string", minLength: 1, maxLength: 20 },
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
        let triggerNum: number;
        let priceNum: number;

        if (body.triggerPrice !== undefined && Number(body.triggerPrice) > 0) {
          triggerNum = Number(body.triggerPrice);
          priceNum = Math.round((triggerNum - 0.10) * 100) / 100;
        } else if (body.price !== undefined && Number(body.price) > 0) {
          priceNum = Number(body.price);
          triggerNum = Math.round((priceNum + 0.10) * 100) / 100;
        } else {
          return reply.code(400).send({
            error: "Provide either triggerPrice or price for the SELL SL-Limit order",
          });
        }

        if (triggerNum <= 0 || priceNum <= 0) {
          return reply.code(400).send({ error: "Trigger price and price must be positive numbers" });
        }

        let brokerRequestStarted = false;
        try {
          const contract = (await getNiftyContracts()).find(
            ({ tradingSymbol }) => tradingSymbol.toUpperCase() === body.tradingSymbol.toUpperCase(),
          );
          if (!contract) {
            return reply.code(400).send({
              error: `Contract for trading symbol ${body.tradingSymbol} was not found in Scrip Master`,
            });
          }
          const quantity = Number(body.quantity);
          const lotSize = Number(contract.lotSize);
          if (!Number.isSafeInteger(lotSize) || lotSize < 1 || quantity % lotSize !== 0) {
            return reply.code(400).send({
              error: "Order quantity must be a whole number of lots for this contract",
            });
          }

          brokerRequestStarted = true;
          const amo = body.amo ?? (isAfterMarketHours() ? "YES" : "NO");
          return await client.placeNiftyOptionOrder(authenticatedSession, {
            tradingSymbol: contract.tradingSymbol,
            instrumentToken: contract.instrumentToken,
            transactionType: "S",
            quantity: body.quantity,
            product: body.product ?? "MIS",
            orderType: "SL",
            price: priceNum.toFixed(2),
            validity: "DAY",
            amo,
            disclosedQuantity: "0",
            marketProtection: "0",
            triggerPrice: triggerNum.toFixed(2),
            ...(body.tag ? { tag: body.tag } : {}),
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
            },
            "Kotak Neo SELL SL-Limit order failed",
          );
          return reply.code(statusCode).send({
            error: outcomeUncertain
              ? "Order outcome could not be confirmed; check your Kotak Neo order book before retrying"
              : error instanceof KotakNeoError
                ? error.message
                : "SELL SL-Limit order could not be prepared",
          });
        }
      },
    );

    registerKotakRoute<{ Body: CancelOrderBody }>(api, "POST",
      "/api/orders/cancel",
      {
        schema: {
          tags: ["Orders"],
          summary: "Cancel an open order",
          description:
            "Cancels an open order by its order number (on / orderNumber). Supports After Market Orders (AMO) when amo is 'YES' and tradingSymbol is provided.",
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              orderNumber: {
                type: "string",
                minLength: 1,
                maxLength: 64,
                description: "Order number (Nest order number)",
              },
              on: {
                type: "string",
                minLength: 1,
                maxLength: 64,
                description: "Alias for orderNumber",
              },
              orderNo: {
                type: "string",
                minLength: 1,
                maxLength: 64,
                description: "Alias for orderNumber",
              },
              amo: {
                type: "string",
                enum: ["YES", "NO"],
                default: "NO",
                description: "AMO flag ('YES' for After Market Orders)",
              },
              tradingSymbol: {
                type: "string",
                minLength: 1,
                maxLength: 64,
                description: "Trading symbol (mandatory for AMO orders)",
              },
            },
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
          return reply
            .code(401)
            .send({ error: "Authenticate with Kotak Neo before cancelling an order" });
        }
        if (!client?.cancelOrder || !config.kotakNeo.cancelOrderPath) {
          return reply.code(503).send({
            error:
              "Kotak Neo cancel order API is not configured; set KOTAK_NEO_CANCEL_ORDER_PATH",
          });
        }
        const authenticatedSession = session;
        const body = request.body;
        const orderNumber = body.orderNumber ?? body.on ?? body.orderNo;

        if (!orderNumber || typeof orderNumber !== "string" || orderNumber.trim() === "") {
          return reply.code(400).send({
            error: "orderNumber (or on/orderNo) is required to cancel an order",
          });
        }

        const amo = body.amo ?? "NO";
        if (amo === "YES" && (!body.tradingSymbol || body.tradingSymbol.trim() === "")) {
          return reply.code(400).send({
            error: "tradingSymbol is required when cancelling an After Market Order (AMO)",
          });
        }

        let brokerRequestStarted = false;
        try {
          brokerRequestStarted = true;
          return await client.cancelOrder(authenticatedSession, {
            orderNumber: orderNumber.trim(),
            amo,
            ...(body.tradingSymbol ? { tradingSymbol: body.tradingSymbol.trim() } : {}),
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
            "Kotak Neo cancel order failed",
          );
          return reply.code(statusCode).send({
            error: outcomeUncertain
              ? "Order cancellation outcome could not be confirmed; check your Kotak Neo order book before retrying"
              : error instanceof KotakNeoError
                ? error.message
                : "Order cancellation could not be prepared",
          });
        }
      },
    );

    const defaultToDate = new Date().toISOString().slice(0, 10);
    const defaultFromDateObj = new Date();
    defaultFromDateObj.setUTCDate(defaultFromDateObj.getUTCDate() - 2);
    const defaultFromDate = defaultFromDateObj.toISOString().slice(0, 10);

    registerKotakRoute<{ Querystring: HistoricalDataQuery }>(api, "GET",
      "/api/market-data/historical",
      {
        schema: {
          tags: ["Market Data"],
          summary: "Get historical candle (OHLCV) data (defaults to Nifty 50)",
          description:
            "Returns historical candles (OHLCV) from Kotak Neo. Pre-filled in Swagger with Nifty 50 (nse_cm|26000), last 2 days, and 10min interval.",
          querystring: {
            type: "object",
            additionalProperties: true,
            properties: {
              neosymbol: {
                type: "string",
                default: "nse_cm|26000",
                description:
                  "Exchange segment and instrument token (Nifty 50 = nse_cm|26000, HDFC Bank = nse_cm|1333)",
              },
              fromdate: {
                type: "string",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                default: defaultFromDate,
                description: "Start date (YYYY-MM-DD)",
              },
              todate: {
                type: "string",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                default: defaultToDate,
                description: "End date (YYYY-MM-DD)",
              },
              interval: {
                type: "string",
                enum: ["1min", "3min", "5min", "10min", "15min", "30min", "60min", "D", "W"],
                default: "10min",
                description: "Candle interval",
              },
            },
          },
          response: {
            200: {
              type: "object",
              required: ["status", "interval", "data"],
              additionalProperties: true,
              properties: {
                status: { type: "string" },
                interval: { type: "string" },
                data: {
                  type: "object",
                  required: ["candles"],
                  additionalProperties: true,
                  properties: {
                    candles: {
                      type: "array",
                      items: {
                        type: "array",
                        items: {
                          anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }],
                        },
                      },
                    },
                  },
                },
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
        if (!session) {
          return reply
            .code(401)
            .send({ error: "Authenticate with Kotak Neo before requesting historical data" });
        }
        if (!client?.getHistoricalData || !config.kotakNeo.historicalDataPath) {
          return reply.code(503).send({
            error:
              "Kotak Neo historical data API is not configured; set KOTAK_NEO_HISTORICAL_DATA_PATH",
          });
        }

        const q = request.query ?? {};
        const todayStr = new Date().toISOString().slice(0, 10);
        const twoDaysAgoObj = new Date();
        twoDaysAgoObj.setUTCDate(twoDaysAgoObj.getUTCDate() - 2);
        const twoDaysAgoStr = twoDaysAgoObj.toISOString().slice(0, 10);

        const fromDate =
          optionalString(q.fromDate) ?? optionalString(q.fromdate) ?? twoDaysAgoStr;
        const toDate = optionalString(q.toDate) ?? optionalString(q.todate) ?? todayStr;
        const interval = optionalString(q.interval) ?? "10min";

        const maxDays = getIntervalMaxDays(interval);
        if (maxDays === 0) {
          return reply.code(400).send({ error: "Invalid interval value" });
        }
        const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
        const toMs = Date.parse(`${toDate}T00:00:00Z`);
        if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
          return reply.code(400).send({
            error: "fromdate must be a valid YYYY-MM-DD date on or before todate",
          });
        }
        if ((toMs - fromMs) / 86_400_000 > maxDays) {
          return reply.code(400).send({
            error: `Date range exceeds maximum of ${maxDays} days for interval ${interval}`,
          });
        }

        try {
          const rawSymbol = optionalString(q.symbol ?? q.tradingSymbol);
          const rawToken = optionalString(q.instrumentToken ?? q.token);
          const rawSegment = optionalString(q.exchangeSegment ?? q.es);
          const rawNeoSymbol =
            optionalString(q.neoSymbol) ??
            (!rawSymbol && !rawToken ? optionalString(q.neosymbol) : undefined);

          let neoSymbol = "nse_cm|26000";
          if (rawNeoSymbol) {
            const [seg, tok] = rawNeoSymbol.split("|");
            if (!seg || !tok) {
              return reply.code(400).send({
                error: "neosymbol must be formatted as <exchange_segment>|<instrument_token>",
              });
            }
            const normalizedToken = /^nifty(?:\s*50)?$/i.test(tok.trim()) ? "26000" : tok.trim();
            neoSymbol = `${seg.trim()}|${normalizedToken}`;
          } else if (rawToken) {
            const normalizedToken = /^nifty(?:\s*50)?$/i.test(rawToken) ? "26000" : rawToken;
            neoSymbol = `${rawSegment ?? "nse_cm"}|${normalizedToken}`;
          } else if (rawSymbol) {
            if (rawSymbol.includes("|")) {
              const [seg, tok] = rawSymbol.split("|");
              const normalizedToken = /^nifty(?:\s*50)?$/i.test((tok ?? "").trim())
                ? "26000"
                : (tok ?? "").trim();
              neoSymbol = `${seg!.trim()}|${normalizedToken}`;
            } else if (/^nifty(?:\s*50)?$/i.test(rawSymbol)) {
              neoSymbol = `${rawSegment ?? "nse_cm"}|26000`;
            } else if (/^\d+$/.test(rawSymbol)) {
              neoSymbol = `${rawSegment ?? "nse_cm"}|${rawSymbol}`;
            } else {
              const contract = (await getNiftyContracts()).find(
                ({ tradingSymbol }) => tradingSymbol.toUpperCase() === rawSymbol.toUpperCase(),
              );
              if (!contract) {
                return reply.code(400).send({
                  error: `Instrument ${rawSymbol} was not found in the local Scrip Master`,
                });
              }
              neoSymbol = `nse_fo|${contract.instrumentToken}`;
            }
          }

          const historicalData = await client.getHistoricalData(session, {
            neoSymbol,
            fromDate,
            toDate,
            interval,
          });
          return {
            ...historicalData,
            interval: optionalString(historicalData.interval) ?? interval,
          };
        } catch (error) {
          const statusCode = historicalDataRequestStatus(error);
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
            "Kotak Neo historical data request failed",
          );
          return reply.code(statusCode).send({
            error:
              error instanceof KotakNeoError
                ? error.message
                : "Historical data request could not be prepared",
          });
        }
      },
    );
}

async function readLocalNseFoMaster(): Promise<string> {
  try {
    return await readFile(new URL("../../src/nse_fo.csv", import.meta.url), "utf8");
  } catch {
    throw new KotakNeoError("Local NSE F&O Scrip Master file could not be read", 503);
  }
}

type KotakRouteOptions<Route extends RouteGenericInterface> = RouteShorthandOptions<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  Route
>;

type KotakRouteHandler<Route extends RouteGenericInterface> = RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  Route
>;

function registerKotakRoute<Route extends RouteGenericInterface = RouteGenericInterface>(
  api: FastifyInstance,
  method: "GET" | "POST",
  legacyPath: string,
  options: KotakRouteOptions<Route>,
  handler: KotakRouteHandler<Route>,
): void {
  const schema = options.schema;
  api.route<Route>({
    ...options,
    method,
    url: legacyPath,
    schema: { ...schema, deprecated: true },
    handler,
  });
  api.route<Route>({
    ...options,
    method,
    url: legacyPath.replace(/^\/api\//, "/api/kotak-neo/"),
    handler,
  });
}

function authenticationErrorStatus(error: unknown): 401 | 429 | 502 | 503 | 504 {
  if (!(error instanceof KotakNeoError)) return 502;
  if (error.statusCode === 400 || error.statusCode === 401) return 401;
  if (error.statusCode === 429) return 429;
  if (error.statusCode === 503 || error.statusCode === 504) return error.statusCode;
  return 502;
}

function orderRequestStatus(error: unknown): 400 | 401 | 429 | 502 | 503 | 504 {
  if (!(error instanceof KotakNeoError)) return 502;
  if (error.statusCode === 400) return 400;
  if (error.statusCode === 401 || error.statusCode === 403) return 401;
  if (error.statusCode === 429) return 429;
  if (error.statusCode === 502) return 502;
  if (error.statusCode === 503) return 503;
  if (error.statusCode === 504) return 504;
  return 502;
}

function historicalDataRequestStatus(error: unknown): 400 | 401 | 429 | 502 | 503 | 504 {
  return orderRequestStatus(error);
}

function getIntervalMaxDays(interval: string): number {
  switch (interval) {
    case "1min":
    case "3min":
    case "5min":
      return 30;
    case "10min":
    case "15min":
      return 60;
    case "30min":
    case "60min":
      return 90;
    case "D":
    case "W":
      return 180;
    default:
      return 0;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isAfterMarketHours(now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return true;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find(({ type }) => type === "hour")?.value ?? 0);
  const minute = Number(parts.find(({ type }) => type === "minute")?.value ?? 0);
  const timeMinutes = hour * 60 + minute;

  const marketOpenMinutes = 9 * 60;
  const marketCloseMinutes = 15 * 60 + 30;
  return timeMinutes < marketOpenMinutes || timeMinutes > marketCloseMinutes;
}
