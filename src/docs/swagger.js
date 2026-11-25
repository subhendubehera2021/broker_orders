import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import {
  optionChainInstrumentModel,
  optionChainModel,
} from "../fyers/models/option-chain.model.js";
import { FYERS_HISTORICAL_RESOLUTIONS } from "../fyers/constants/fyers-market-data.js";
import { highestVolumeOptionsModel } from "../internal/models/highest-volume-options.model.js";
import {
  autoTradeProcessModel,
  autoTradeProcessRequestModel,
} from "../auto-trade-process/models/auto-trade-process.model.js";

const router = Router();

const openapiSpecification = {
  openapi: "3.0.3",
  info: {
    title: "Auto Trade Processor API",
    version: "1.0.0",
    description: "Market data endpoints backed by the Fyers API.",
  },
  tags: [
    { name: "Fyers", description: "Direct Fyers market-data APIs." },
    { name: "Internal", description: "Application-specific APIs and analysis." },
    { name: "Auto Trade Process", description: "Auto-trade process market-data APIs." },
  ],
  components: {
    schemas: {
      OptionChainInstrument: optionChainInstrumentModel,
      OptionChainModel: optionChainModel,
      HighestVolumeOptions: highestVolumeOptionsModel,
      AutoTradeProcess: autoTradeProcessModel,
      AutoTradeProcessRequest: autoTradeProcessRequestModel,
    },
  },
  paths: {
    "/": {
      get: {
        tags: ["Internal"],
        summary: "List API links",
        responses: {
          200: {
            description: "API name, documentation path, and available endpoints.",
          },
        },
      },
    },
    "/api/internal/health": {
      get: {
        tags: ["Internal"],
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
    "/api/fyers/market-data/historical-data": {
      get: {
        tags: ["Fyers"],
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
    "/api/fyers/market-data/option-chain": {
      get: {
        tags: ["Fyers"],
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
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OptionChainModel" },
              },
            },
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
    "/api/fyers/market-data/quotes": {
      get: {
        tags: ["Fyers"],
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
    "/api/internal/liquidity-swings": {
      get: {
        tags: ["Internal"],
        summary: "Analyze liquidity swings",
        description: "Fetch Fyers historical candles and return the latest confirmed liquidity swing high. Defaults to the recent three-day India date range.",
        parameters: [
          {
            name: "symbol",
            in: "query",
            required: true,
            schema: { type: "string", example: "NSE:SBIN-EQ" },
          },
          {
            name: "fromDate",
            in: "query",
            required: false,
            description: "YYYY-MM-DD; provide together with toDate.",
            schema: { type: "string", format: "date", example: "2025-01-01" },
          },
          {
            name: "toDate",
            in: "query",
            required: false,
            description: "YYYY-MM-DD; provide together with fromDate.",
            schema: { type: "string", format: "date", example: "2025-01-03" },
          },
          {
            name: "resolution",
            in: "query",
            required: false,
            description: "Fyers candle resolution; defaults to 1-minute candles.",
            schema: {
              type: "string",
              enum: ["5S", "10S", "15S", "30S", "45S", "1", "2", "3", "5", "10", "15", "20", "30", "45", "60", "120", "180", "240", "D", "1D", "1W", "1M"],
              default: "1",
            },
          },
          {
            name: "pivotLookback",
            in: "query",
            required: false,
            description: "Positive number of candles on each side used to confirm a pivot; defaults to 5.",
            schema: { type: "integer", minimum: 1, default: 5 },
          },
          {
            name: "contFlag",
            in: "query",
            required: false,
            description: "Set to 1 for continuous futures/options data.",
            schema: { type: "string", enum: ["0", "1"] },
          },
        ],
        responses: {
          200: {
            description: "Historical candles and the latest confirmed swing, or null if none is found.",
          },
          400: {
            description: "Missing or invalid query parameters.",
          },
          502: {
            description: "Fyers historical-data request or response failed.",
          },
          503: {
            description: "Fyers credentials are not configured.",
          },
        },
      },
    },
    "/api/internal/option-chain/highest-volume": {
      get: {
        tags: ["Internal"],
        summary: "Find the highest-volume call and put in an LTP range",
        description: "Fetches the Fyers option chain, optionally filters CE and PE contracts by the inclusive LTP bounds, then selects the highest-volume match for each side.",
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
            name: "greeks",
            in: "query",
            required: false,
            description: "Set to 1 to include Greeks in selected contracts.",
            schema: { type: "string", enum: ["0", "1"], example: "0" },
          },
          {
            name: "timestamp",
            in: "query",
            required: false,
            description: "Option-chain timestamp; leave empty for current data.",
            schema: { type: "string", example: "" },
          },
          {
            name: "ltpMin",
            in: "query",
            required: false,
            description: "Optional inclusive minimum LTP.",
            schema: { type: "number", minimum: 0, example: 100 },
          },
          {
            name: "ltpMax",
            in: "query",
            required: false,
            description: "Optional inclusive maximum LTP.",
            schema: { type: "number", minimum: 0, example: 300 },
          },
        ],
        responses: {
          200: {
            description: "Highest-volume CE and PE contracts within the supplied bounds, or across all returned strikes when bounds are omitted. A side is null if no contract matches.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HighestVolumeOptions" },
              },
            },
          },
          400: {
            description: "Missing or invalid query parameters.",
          },
          502: {
            description: "Fyers option-chain request or response failed.",
          },
          503: {
            description: "Fyers credentials are not configured.",
          },
        },
      },
    },
    "/api/auto-trade-process": {
      get: {
        tags: ["Auto Trade Process"],
        summary: "Get auto-trade-process option data",
        description: "Fetches the highest-volume CE and PE, analyzes each selected symbol, and saves only changed swing results to Turso.",
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
            schema: { type: "integer", minimum: 1, maximum: 50, example: 50 },
          },
          {
            name: "greeks",
            in: "query",
            required: false,
            description: "Set to 1 to include Greeks in selected contracts.",
            schema: { type: "integer", enum: [0, 1], example: 0 },
          },
          {
            name: "ltpMin",
            in: "query",
            required: false,
            description: "Optional inclusive minimum LTP.",
            schema: { type: "number", minimum: 0, example: 100 },
          },
          {
            name: "ltpMax",
            in: "query",
            required: false,
            description: "Optional inclusive maximum LTP.",
            schema: { type: "number", minimum: 0, example: 140 },
          },
          {
            name: "resolution",
            in: "query",
            required: false,
            description: "Candle resolution for Step 2. Defaults to 1 (one minute); resolution 3 is aggregated from 1-minute data, and other supported intervals are fetched directly.",
            schema: {
              type: "string",
              enum: [...FYERS_HISTORICAL_RESOLUTIONS],
              default: "1",
              example: "5",
            },
          },
          {
            name: "pivotLookback",
            in: "query",
            required: false,
            description: "Number of bars on each side used to confirm a swing high. Defaults to 5.",
            schema: { type: "integer", minimum: 1, default: 5, example: 8 },
          },
        ],
        responses: {
          200: {
            description: "Highest-volume CE and PE contracts with Step 2 liquidity-swing analyses.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AutoTradeProcess" },
              },
            },
          },
          400: {
            description: "Missing or invalid option-chain or liquidity-swing query parameters.",
          },
          502: {
            description: "Option-chain request failed.",
          },
          503: {
            description: "Fyers or Turso credentials are missing, or Turso persistence is unavailable.",
          },
        },
      },
      post: {
        tags: ["Auto Trade Process"],
        summary: "Analyze multiple liquidity-swing configurations",
        description: "Finds the highest-volume CE and PE, calculates every requested swing configuration, and saves only changed swing results to Turso. One-minute data is reused for 1-minute and aggregated 3-minute configurations; other supported intervals are fetched directly. Three-minute candles require complete consecutive one-minute candles.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AutoTradeProcessRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Highest-volume CE and PE contracts, swing analyses, and persistence counts.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AutoTradeProcess" },
              },
            },
          },
          400: {
            description: "Invalid request body, option-chain settings, or swing configurations.",
          },
          502: {
            description: "Option-chain or historical-data request failed.",
          },
          503: {
            description: "Fyers or Turso credentials are missing, or Turso persistence is unavailable.",
          },
        },
      },
    },
  },
};

router.use(swaggerUi.serve);
router.get(
  "/",
  swaggerUi.setup(openapiSpecification, {
    swaggerOptions: {
      docExpansion: "none",
    },
  }),
);

export default router;
