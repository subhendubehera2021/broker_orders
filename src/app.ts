import Fastify, { LogController, type FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { AppConfig } from "./config.js";
import { openapiOptions } from "./openapi.js";
import { KotakNeoClient } from "./kotak-neo/client.js";
import {
  registerKotakNeoRoutes,
  type KotakNeoRouteClient,
} from "./kotak-neo/routes.js";
import { PaytmMoneyClient } from "./paytm-money/client.js";
import {
  registerPaytmMoneyRoutes,
  type PaytmMoneyRouteClient,
} from "./paytm-money/routes.js";
import { renderLoginPage } from "./login-page.js";

interface AppOptions {
  config: AppConfig;
  authClient?: KotakNeoRouteClient;
  paytmMoneyClient?: PaytmMoneyRouteClient;
  optionChainCsvLoader?: () => Promise<string>;
}

export function buildApp({
  config,
  authClient,
  paytmMoneyClient,
  optionChainCsvLoader,
}: AppOptions): FastifyInstance {
  const app = Fastify({
    bodyLimit: 1024,
    logger: true,
    logController: new LogController({ disableRequestLogging: true }),
  });

  const kotakClient =
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

  const paytmClient =
    paytmMoneyClient ??
    (config.paytmMoney ? new PaytmMoneyClient(config.paytmMoney) : undefined);

  app.get("/", async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html; charset=utf-8")
      .send(renderLoginPage(config.kotakNeo));
  });

  app.register(async (api) => {
    await api.register(swagger, openapiOptions);
    await api.register(swaggerUi, {
      routePrefix: "/docs",
    });

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

    registerKotakNeoRoutes(api, {
      config,
      authClient: kotakClient,
      ...(optionChainCsvLoader ? { optionChainCsvLoader } : {}),
    });
    registerPaytmMoneyRoutes(api, { config, paytmMoneyClient: paytmClient });
  });

  return app;
}
