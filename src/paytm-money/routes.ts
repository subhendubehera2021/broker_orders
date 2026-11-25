import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { errorResponseSchema, validateApiKey } from "../http-utils.js";
import {
  PaytmMoneyError,
  type PaytmMoneyAccessTokens,
  type PaytmMoneyRegularOrderInput,
  type PaytmMoneyRegularOrderResponse,
  type PaytmMoneyUserDetails,
} from "./client.js";

interface PaytmMoneyCallbackQuery {
  request_token?: string;
  requestToken?: string;
  state: string;
  success?: "true" | "false";
}

export interface PaytmMoneyRouteClient {
  createLoginUrl(state: string): URL;
  generateAccessToken(requestToken: string): Promise<PaytmMoneyAccessTokens>;
  getUserDetails(accessToken: string): Promise<PaytmMoneyUserDetails>;
  placeRegularOrder(
    accessToken: string,
    order: PaytmMoneyRegularOrderInput,
  ): Promise<PaytmMoneyRegularOrderResponse>;
}

export interface PaytmMoneyRoutesOptions {
  config: AppConfig;
  paytmMoneyClient?: PaytmMoneyRouteClient;
}

export function registerPaytmMoneyRoutes(
  api: FastifyInstance,
  { config, paytmMoneyClient: paytmClient }: PaytmMoneyRoutesOptions,
): void {
  let paytmLoginState: { value: string; expiresAt: number } | undefined;
  let paytmAccessTokens: PaytmMoneyAccessTokens | undefined;

    api.get(
      "/api/paytm-money/auth/login",
      {
        schema: {
          tags: ["Paytm Money"],
          summary: "Start Paytm Money login",
          description:
            "Returns the Paytm Money login URL. Register this app's public /api/paytm-money/auth/callback URL as the Return URL in the Paytm Money developer portal.",
          response: {
            200: {
              type: "object",
              required: ["loginUrl"],
              properties: { loginUrl: { type: "string", format: "uri" } },
            },
            503: errorResponseSchema,
          },
        },
      },
      async (_request, reply) => {
        if (!paytmClient) {
          return reply.code(503).send({ error: "Paytm Money API credentials are not configured" });
        }

        const state = randomUUID();
        paytmLoginState = {
          value: state,
          expiresAt: Date.now() + 5 * 60 * 1000,
        };
        return { loginUrl: paytmClient.createLoginUrl(state).toString() };
      },
    );

    api.get<{ Querystring: PaytmMoneyCallbackQuery }>(
      "/api/paytm-money/auth/callback",
      {
        schema: {
          tags: ["Paytm Money"],
          summary: "Complete Paytm Money login",
          description:
            "Paytm Money redirects here with requestToken (or request_token), state, and optionally success. The state must match a login started within the last five minutes. Access tokens are stored server-side and are not returned.",
          querystring: {
            type: "object",
            required: ["state"],
            anyOf: [
              { required: ["request_token"] },
              { required: ["requestToken"] },
              {
                required: ["success"],
                properties: { success: { const: "false" } },
              },
            ],
            additionalProperties: false,
            properties: {
              request_token: { type: "string", minLength: 1, maxLength: 4096 },
              requestToken: { type: "string", minLength: 1, maxLength: 4096 },
              state: { type: "string", minLength: 1, maxLength: 128 },
              success: { type: "string", enum: ["true", "false"] },
            },
          },
          response: {
            200: {
              type: "object",
              required: ["authenticated"],
              properties: { authenticated: { type: "boolean", const: true } },
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
        reply.header("Cache-Control", "no-store");
        reply.header("Referrer-Policy", "no-referrer");
        if (!paytmClient) {
          return reply.code(503).send({ error: "Paytm Money API credentials are not configured" });
        }
        if (!paytmLoginState || paytmLoginState.expiresAt < Date.now()) {
          paytmLoginState = undefined;
          return reply.code(400).send({ error: "Paytm Money login state is missing or expired" });
        }
        if (request.query.state !== paytmLoginState.value) {
          return reply.code(400).send({ error: "Paytm Money login state does not match" });
        }

        if (request.query.success === "false") {
          paytmLoginState = undefined;
          return reply.code(400).send({ error: "Paytm Money login was not successful" });
        }

        const requestToken = request.query.requestToken ?? request.query.request_token;
        if (!requestToken) {
          return reply.code(400).send({ error: "Paytm Money request token is missing" });
        }

        paytmLoginState = undefined;
        try {
          paytmAccessTokens = await paytmClient.generateAccessToken(requestToken);
          return { authenticated: true };
        } catch (error) {
          const statusCode = paytmMoneyRequestStatus(error);
          request.log.error(
            { statusCode, errorName: error instanceof Error ? error.name : "UnknownError" },
            "Paytm Money authentication failed",
          );
          return reply.code(statusCode).send({
            error:
              error instanceof PaytmMoneyError
                ? error.message
                : "Paytm Money authentication could not be completed",
          });
        }
      },
    );

    api.post<{ Body: PaytmMoneyRegularOrderInput }>(
      "/api/paytm-money/orders/regular",
      {
        schema: {
          tags: ["Paytm Money Orders"],
          summary: "Place a Paytm Money regular order",
          description:
            "Submits a live regular order to Paytm Money. Requires an authenticated Paytm Money session and the app's x-api-key. Market orders are not supported; use LMT for limit orders.",
          security: [{ AppApiKey: [] }],
          body: {
            type: "object",
            required: [
              "txn_type",
              "exchange",
              "segment",
              "product",
              "security_id",
              "quantity",
              "validity",
              "order_type",
              "price",
            ],
            additionalProperties: false,
            properties: {
              source: { type: "string", enum: ["W", "M", "N", "I", "R", "O"] },
              txn_type: { type: "string", enum: ["B", "S"] },
              exchange: { type: "string", enum: ["NSE", "BSE"] },
              segment: { type: "string", enum: ["E", "D"] },
              product: { type: "string", enum: ["C", "I", "B", "V", "M"] },
              security_id: { type: "string", minLength: 1, maxLength: 128 },
              quantity: { type: "integer", minimum: 1 },
              validity: { type: "string", enum: ["DAY", "IOC", "GTC", "GTD"] },
              order_type: { type: "string", enum: ["LMT", "SL", "SLM"] },
              price: { type: "number", minimum: 0 },
              trigger_price: { type: "number", minimum: 0 },
              off_mkt_flag: {
                anyOf: [
                  { type: "string", enum: ["true", "false"] },
                  { type: "boolean" },
                ],
              },
              order_ltp: { type: "number", minimum: 0 },
            },
            oneOf: [
              { properties: { order_type: { const: "LMT" } } },
              {
                required: ["trigger_price"],
                properties: { order_type: { enum: ["SL", "SLM"] } },
              },
            ],
          },
          response: {
            200: {
              type: "object",
              required: ["status", "message", "data"],
              properties: {
                status: { type: "string" },
                message: { type: "string" },
                data: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    required: ["order_no"],
                    properties: { order_no: { type: "string" } },
                  },
                },
                error_code: { type: "string" },
              },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
            504: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const apiKeyHeader = request.headers["x-api-key"];
        const providedKey = typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : undefined;
        if (!providedKey || !validateApiKey(providedKey, config.apiKey)) {
          return reply.code(401).send({ error: "Invalid or missing x-api-key header" });
        }
        if (!paytmClient) {
          return reply.code(503).send({ error: "Paytm Money API credentials are not configured" });
        }
        if (!paytmAccessTokens) {
          return reply.code(404).send({ error: "No active Paytm Money session found" });
        }

        try {
          return await paytmClient.placeRegularOrder(
            paytmAccessTokens.access_token,
            request.body,
          );
        } catch (error) {
          const statusCode = paytmMoneyRequestStatus(error);
          request.log.error(
            { statusCode, errorName: error instanceof Error ? error.name : "UnknownError" },
            "Paytm Money regular order request failed",
          );
          return reply.code(statusCode).send({
            error:
              error instanceof PaytmMoneyError
                ? error.message
                : "Paytm Money regular order could not be submitted",
          });
        }
      },
    );

    api.get(
      "/api/paytm-money/user-details",
      {
        schema: {
          tags: ["Paytm Money"],
          summary: "Get authenticated Paytm Money user details",
          description:
            "Fetches user details with the locally stored read access token. Requires the app's x-api-key; broker tokens are never returned.",
          security: [{ AppApiKey: [] }],
          response: {
            200: {
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "object",
                  required: ["kycName", "userId", "activeSegments"],
                  properties: {
                    kycName: { type: "string" },
                    userId: { anyOf: [{ type: "string" }, { type: "number" }] },
                    activeSegments: { type: "array", items: { type: "string" } },
                  },
                },
                meta: {
                  type: "object",
                  properties: {
                    requestId: { anyOf: [{ type: "string" }, { type: "null" }] },
                    responseId: { anyOf: [{ type: "string" }, { type: "null" }] },
                    code: { type: "string" },
                    message: { type: "string" },
                    displayMessage: { type: "string" },
                  },
                },
              },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
            504: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const apiKeyHeader = request.headers["x-api-key"];
        const providedKey = typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : undefined;
        if (!providedKey || !validateApiKey(providedKey, config.apiKey)) {
          return reply.code(401).send({ error: "Invalid or missing x-api-key header" });
        }
        if (!paytmClient) {
          return reply.code(503).send({ error: "Paytm Money API credentials are not configured" });
        }
        if (!paytmAccessTokens) {
          return reply.code(404).send({ error: "No active Paytm Money session found" });
        }

        try {
          return await paytmClient.getUserDetails(paytmAccessTokens.read_access_token);
        } catch (error) {
          const statusCode = paytmMoneyRequestStatus(error);
          request.log.error(
            { statusCode, errorName: error instanceof Error ? error.name : "UnknownError" },
            "Paytm Money user-details request failed",
          );
          return reply.code(statusCode).send({
            error:
              error instanceof PaytmMoneyError
                ? error.message
                : "Paytm Money user details could not be retrieved",
          });
        }
      },
    );

    api.post(
      "/api/paytm-money/auth/logout",
      {
        schema: {
          tags: ["Paytm Money"],
          summary: "Clear local Paytm Money session",
          description:
            "Discards locally held Paytm Money access tokens. Requires the app's x-api-key and does not revoke the broker-side session.",
          security: [{ AppApiKey: [] }],
          response: {
            200: {
              type: "object",
              required: ["authenticated"],
              properties: { authenticated: { type: "boolean", const: false } },
            },
            401: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const apiKeyHeader = request.headers["x-api-key"];
        const providedKey = typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : undefined;
        if (!providedKey || !validateApiKey(providedKey, config.apiKey)) {
          return reply.code(401).send({ error: "Invalid or missing x-api-key header" });
        }
        paytmAccessTokens = undefined;
        paytmLoginState = undefined;
        return { authenticated: false };
      },
    );


}

function paytmMoneyRequestStatus(error: unknown): 400 | 401 | 429 | 502 | 503 | 504 {
  if (!(error instanceof PaytmMoneyError)) return 502;
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
