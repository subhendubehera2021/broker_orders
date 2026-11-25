import { FYERS_HISTORICAL_RESOLUTIONS } from "../../fyers/constants/fyers-market-data.js";

const liquiditySwingModel = {
  type: "object",
  nullable: true,
  required: [
    "side",
    "pivotTime",
    "confirmedAt",
    "level",
    "zoneTop",
    "zoneBottom",
    "intersectionCount",
    "intersectionVolume",
    "status",
  ],
  properties: {
    side: { type: "string", enum: ["high"] },
    pivotTime: { type: "string", format: "date-time" },
    confirmedAt: { type: "string", format: "date-time" },
    level: { type: "number" },
    zoneTop: { type: "number" },
    zoneBottom: { type: "number" },
    intersectionCount: { type: "integer", minimum: 0 },
    intersectionVolume: { type: "number", minimum: 0 },
    status: { type: "string", enum: ["tracking", "qualified", "broken"] },
    brokenAt: { type: "string", format: "date-time" },
  },
};

export const autoTradeProcessRequestModel = {
  type: "object",
  required: ["symbol", "swingConfigs"],
  properties: {
    symbol: { type: "string", example: "NSE:NIFTY50-INDEX" },
    strikecount: { type: "integer", minimum: 1, maximum: 50, example: 50 },
    greeks: { type: "integer", enum: [0, 1], example: 0 },
    timestamp: { type: "string", default: "" },
    ltpMin: { type: "number", minimum: 0, example: 100 },
    ltpMax: { type: "number", minimum: 0, example: 140 },
    swingConfigs: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        required: ["resolution", "pivotLookback"],
        properties: {
          resolution: {
            type: "string",
            enum: [...FYERS_HISTORICAL_RESOLUTIONS],
            description: "Resolutions 1 and 3 share 1-minute data; 3-minute candles are aggregated. Other supported resolutions are fetched directly.",
          },
          pivotLookback: { type: "integer", minimum: 1 },
        },
      },
    },
  },
};

export const autoTradeProcessModel = {
  allOf: [
    { $ref: "#/components/schemas/HighestVolumeOptions" },
    {
      type: "object",
      required: ["step2"],
      properties: {
        step2: {
          type: "object",
          required: ["selectedCount", "totalVolume", "contracts", "persistence"],
          properties: {
            selectedCount: {
              type: "integer",
              minimum: 0,
              maximum: 2,
              description: "Number of selected CE and PE contracts.",
            },
            totalVolume: {
              type: "number",
              minimum: 0,
              description: "Combined volume of selected CE and PE contracts.",
            },
            contracts: {
              type: "array",
              maxItems: 2,
              description: "Each selected contract with its liquidity-swing configurations.",
              items: {
                type: "object",
                required: ["option_type", "symbol", "ltp", "volume", "liquiditySwings"],
                properties: {
                  option_type: { type: "string", enum: ["CE", "PE"] },
                  symbol: { type: "string" },
                  ltp: { type: "number" },
                  volume: { type: "number" },
                  liquiditySwings: {
                    type: "object",
                    required: ["fromDate", "toDate", "configurations"],
                    properties: {
                      fromDate: { type: "string", format: "date" },
                      toDate: { type: "string", format: "date" },
                      configurations: {
                        type: "array",
                        items: {
                          type: "object",
                          required: [
                            "resolution",
                            "pivotLookback",
                            "barsAnalyzed",
                            "source",
                            "swing",
                          ],
                          properties: {
                            resolution: { type: "string" },
                            pivotLookback: { type: "integer", minimum: 1 },
                            barsAnalyzed: { type: "integer", minimum: 0 },
                            source: {
                              type: "string",
                              enum: ["fyers", "aggregated-from-1-minute"],
                            },
                            swing: liquiditySwingModel,
                          },
                        },
                        persistence: {
                          type: "object",
                          required: ["inserted", "unchanged"],
                          description: "Number of changed swing results saved and unchanged results skipped.",
                          properties: {
                            inserted: { type: "integer", minimum: 0 },
                            unchanged: { type: "integer", minimum: 0 },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
};
