import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import {
  KotakNeoClient,
  KotakNeoError,
  type AuthenticatedSession,
} from "./kotak-neo-client.js";

interface LoginBody {
  mobileNumber: string;
  ucc: string;
  totp: string;
  mpin: string;
}

interface AuthClient {
  login(input: LoginBody): Promise<AuthenticatedSession>;
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

  let session: AuthenticatedSession | undefined;

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/auth/session", async () => ({
    authenticated: Boolean(session),
  }));

  app.post<{ Body: LoginBody }>(
    "/api/auth/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["mobileNumber", "ucc", "totp", "mpin"],
          additionalProperties: false,
          properties: {
            mobileNumber: { type: "string", minLength: 5, maxLength: 20 },
            ucc: { type: "string", minLength: 1, maxLength: 32 },
            totp: { type: "string", pattern: "^\\d{6}$" },
            mpin: { type: "string", minLength: 4, maxLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!client) {
        return reply.code(503).send({ error: "Kotak Neo consumer key is not configured" });
      }

      session = undefined;
      try {
        session = await client.login(request.body);
        return { authenticated: true };
      } catch (error) {
        const statusCode = authenticationErrorStatus(error);
        request.log.error(
          { statusCode, errorName: error instanceof Error ? error.name : "UnknownError" },
          "Kotak Neo authentication failed",
        );
        return reply.code(statusCode).send({
          error:
            statusCode === 401
              ? "Kotak Neo rejected the TOTP or MPIN"
              : "Kotak Neo authentication could not be completed",
        });
      }
    },
  );

  app.post("/api/auth/logout", async () => {
    session = undefined;
    return { authenticated: false };
  });

  return app;
}

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
