import { Router } from "express";
import swaggerUi from "swagger-ui-express";

const router = Router();

const openapiSpecification = {
  openapi: "3.0.3",
  info: {
    title: "Auto Trade Processor API",
    version: "1.0.0",
    description: "Market data endpoints backed by the Fyers API.",
  },
  paths: {
    "/": {
      get: {
        summary: "List API links",
        responses: {
          200: {
            description: "API name, documentation path, and available endpoints.",
          },
        },
      },
    },
    "/api/health": {
      get: {
        summary: "Check API health",
        responses: {
          200: {
            description: "API is running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/market-data/historical-data": {
      get: {
        summary: "Get historical candle data",
        description: "Fetch candle history from Fyers for a symbol and date range.",
        parameters: [
          {
            name: "symbol",
            in: "query",
            required: true,
            schema: { type: "string", example: "NSE:SBIN-EQ" },
          },
          {
            name: "resolution",
            in: "query",
            required: true,
            schema: {
              type: "string",
              enum: ["5S", "10S", "15S", "30S", "45S", "1", "2", "3", "5", "10", "15", "20", "30", "45", "60", "120", "180", "240", "D", "1D", "1W", "1M"],
              example: "D",
            },
          },
          {
            name: "date_format",
            in: "query",
            required: true,
            description: "0 for epoch timestamps in seconds, 1 for YYYY-MM-DD dates.",
            schema: { type: "string", enum: ["0", "1"], example: "0" },
          },
          {
            name: "range_from",
            in: "query",
            required: true,
            schema: { type: "string", example: "1690895316" },
          },
          {
            name: "range_to",
            in: "query",
            required: true,
            schema: { type: "string", example: "1691068173" },
          },
          {
            name: "cont_flag",
            in: "query",
            required: false,
            description: "Set to 1 for continuous futures/options data.",
            schema: { type: "string", enum: ["0", "1"] },
          },
          {
            name: "oi_flag",
            in: "query",
            required: false,
            description: "Set to 1 to include open interest.",
            schema: { type: "string", enum: ["0", "1"] },
          },
        ],
        responses: {
          200: {
            description: "Historical candle data returned by Fyers.",
          },
          400: {
            description: "Missing or invalid query parameters.",
          },
          502: {
            description: "Fyers historical-data request failed.",
          },
          503: {
            description: "Fyers credentials are not configured.",
          },
        },
      },
    },
    "/api/market-data/option-chain": {
      get: {
        summary: "Get an option chain",
        description: "Fetch call and put strikes, expiry data, and optionally Greeks from Fyers.",
        parameters: [
          {
            name: "symbol",
            in: "query",
            required: true,
            schema: { type: "string", example: "NSE:NIFTY50-INDEX" },
          },
          {
            name: "strikecount",
            in: "query",
            required: false,
            description: "Number of strikes on each side of ATM (maximum 50).",
            schema: { type: "integer", minimum: 1, maximum: 50, example: 1 },
          },
          {
            name: "timestamp",
            in: "query",
            required: false,
            description: "Timestamp for chain data; leave empty for current data.",
            schema: { type: "string", example: "" },
          },
          {
            name: "greeks",
            in: "query",
            required: false,
            description: "Set to 1 to include option Greeks.",
            schema: { type: "string", enum: ["0", "1"], example: "1" },
          },
        ],
        responses: {
          200: {
            description: "Option-chain data returned by Fyers.",
          },
          400: {
            description: "Missing or invalid query parameters.",
          },
          502: {
            description: "Fyers option-chain request failed.",
          },
          503: {
            description: "Fyers credentials are not configured.",
          },
        },
      },
    },
    "/api/market-data/quotes": {
      get: {
        summary: "Get quotes for symbols",
        description: "Fetch current quotes for up to 50 symbols in one request.",
        parameters: [
          {
            name: "symbols",
            in: "query",
            required: true,
            description: "Comma-separated Fyers symbols; maximum 50.",
            schema: { type: "string", example: "NSE:SBIN-EQ,NSE:TCS-EQ" },
          },
        ],
        responses: {
          200: {
            description: "Quote data returned by Fyers.",
          },
          400: {
            description: "Missing or invalid symbols.",
          },
          502: {
            description: "Fyers quotes request failed.",
          },
          503: {
            description: "Fyers credentials are not configured.",
          },
        },
      },
    },
  },
};

router.use(swaggerUi.serve);
router.get("/", swaggerUi.setup(openapiSpecification));

export default router;
