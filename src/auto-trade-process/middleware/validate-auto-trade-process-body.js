import { validateOptionChainQuery } from "../../fyers/middleware/validate-option-chain.js";
import { validateLtpRange } from "../../internal/middleware/validate-ltp-range.js";
import { FYERS_HISTORICAL_RESOLUTIONS } from "../../fyers/constants/fyers-market-data.js";

const OPTION_QUERY_FIELDS = [
  "symbol",
  "strikecount",
  "greeks",
  "timestamp",
  "ltpMin",
  "ltpMax",
];
const MAX_SWING_CONFIGS = 20;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toQueryValue(value) {
  return typeof value === "number" ? String(value) : value;
}

function parseSwingConfigs(value) {
  const errors = {};
  if (!Array.isArray(value) || value.length === 0) {
    return {
      configs: [],
      errors: { swingConfigs: "Provide at least one swing configuration." },
    };
  }
  if (value.length > MAX_SWING_CONFIGS) {
    return {
      configs: [],
      errors: { swingConfigs: `Use no more than ${MAX_SWING_CONFIGS} configurations.` },
    };
  }

  const configs = [];
  const seen = new Set();
  value.forEach((config, index) => {
    if (!isRecord(config)) {
      errors[`swingConfigs[${index}]`] = "Provide an object with resolution and pivotLookback.";
      return;
    }

    const resolution = typeof config.resolution === "number"
      ? String(config.resolution)
      : config.resolution;
    if (
      typeof resolution !== "string" ||
      !FYERS_HISTORICAL_RESOLUTIONS.has(resolution)
    ) {
      errors[`swingConfigs[${index}].resolution`] =
        "Use a resolution supported by Fyers historical data.";
      return;
    }

    const pivotLookback = config.pivotLookback;
    if (
      !Number.isSafeInteger(pivotLookback) ||
      pivotLookback < 1
    ) {
      errors[`swingConfigs[${index}].pivotLookback`] = "Use a positive integer.";
      return;
    }

    const key = `${resolution}:${pivotLookback}`;
    if (seen.has(key)) {
      errors[`swingConfigs[${index}]`] = "Duplicate swing configuration.";
      return;
    }
    seen.add(key);
    configs.push({ resolution, pivotLookback });
  });

  return { configs, errors };
}

export function validateAutoTradeProcessBody(request, response, next) {
  if (!isRecord(request.body)) {
    return response.status(400).json({
      error: "Invalid auto-trade-process body.",
      details: { body: "Provide a JSON object." },
    });
  }

  const query = {};
  for (const field of OPTION_QUERY_FIELDS) {
    if (request.body[field] !== undefined) {
      query[field] = toQueryValue(request.body[field]);
    }
  }
  const queryRequest = { query };

  validateOptionChainQuery(queryRequest, response, () => {
    validateLtpRange(queryRequest, response, () => {
      const { configs, errors } = parseSwingConfigs(request.body.swingConfigs);
      if (Object.keys(errors).length > 0) {
        return response.status(400).json({
          error: "Invalid liquidity-swing configurations.",
          details: errors,
        });
      }

      response.locals.liquiditySwingConfigs = configs;
      next();
    });
  });
}
