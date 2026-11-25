import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { errorResponseSchema, validateApiKey } from "../http-utils.js";
import {
  PaytmMoneyError,
  type PaytmMoneyAccessTokens,
  type PaytmMoneyUserDetails,
} from "./client.js";

interface PaytmMoneyCallbackQuery {
  request_token: string;
  state: string;
}

export interface PaytmMoneyRouteClient {
  createLoginUrl(state: string): URL;
  generateAccessToken(requestToken: string): Promise<PaytmMoneyAccessTokens>;
  getUserDetails(accessToken: string): Promise<PaytmMoneyUserDetails>;
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
            "Paytm Money redirects here with request_token and state. The state must match a login started within the last five minutes. Access tokens are stored server-side and are not returned.",
          querystring: {
            type: "object",
            required: ["request_token", "state"],
            additionalProperties: false,
            properties: {
              request_token: { type: "string", minLength: 1, maxLength: 4096 },
              state: { type: "string", minLength: 1, maxLength: 128 },
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

        paytmLoginState = undefined;
        try {
          paytmAccessTokens = await paytmClient.generateAccessToken(request.query.request_token);
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
