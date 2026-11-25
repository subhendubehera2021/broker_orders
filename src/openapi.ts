import type { SwaggerOptions } from "@fastify/swagger";

export const openapiOptions: SwaggerOptions = {
  openapi: {
    openapi: "3.0.3",
    info: {
      title: "Broker Orders API",
      description:
        "Authentication, account, and order APIs for Kotak Neo and Paytm Money.",
      version: "1.0.0",
    },
    tags: [
      { name: "Health", description: "Service health" },
      { name: "Authentication", description: "Kotak Neo session authentication" },
      { name: "Paytm Money", description: "Paytm Money authentication and account details" },
      { name: "Orders", description: "Kotak Neo order placement" },
      { name: "Market Data", description: "Kotak Neo market data APIs" },
    ],
    components: {
      securitySchemes: {
        AppApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
      },
    },
  },
};
