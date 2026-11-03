import Fastify, { type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { AppConfig } from "./config.js";
import {
  KotakNeoClient,
  KotakNeoError,
  type AuthenticatedSession,
  type MarginCheckInput,
} from "./kotak-neo-client.js";
import { renderLoginPage } from "./login-page.js";
import { renderMarginPage } from "./margin-page.js";

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
  checkMargin?(session: AuthenticatedSession, input: MarginCheckInput): Promise<unknown>;
}

interface AppOptions {
  config: AppConfig;
  authClient?: AuthClient;
}

export function buildApp({ config, authClient }: AppOptions): FastifyInstance {
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
        ],
      },
    });
    await api.register(swaggerUi, {
      routePrefix: "/docs",
    });

    let session: AuthenticatedSession | undefined;

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
