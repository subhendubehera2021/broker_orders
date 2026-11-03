import Fastify, { type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { AppConfig } from "./config.js";
import {
  KotakNeoClient,
  KotakNeoError,
  type AuthenticatedSession,
} from "./kotak-neo-client.js";
import { renderLoginPage } from "./login-page.js";

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

  app.register(async (api) => {
    await api.register(swagger, {
      openapi: {
        openapi: "3.0.3",
        info: {
          title: "Kotak Neo API",
          description: "Authentication API for the Kotak Neo trading service.",
          version: "1.0.0",
        },
        tags: [
          { name: "Health", description: "Service health" },
          { name: "Authentication", description: "Kotak Neo session authentication" },
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
  });

  return app;
}

const errorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: { error: { type: "string" } },
} as const;

function authenticationErrorStatus(error: unknown): number {
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
