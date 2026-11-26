import { FYERS_HISTORICAL_RESOLUTIONS } from "../../fyers/constants/fyers-market-data.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 200;
const MAX_ANALYSIS_COMMENT_LENGTH = 2000;
const HISTORY_STATUSES = new Set(["tracking", "broken", "qualified"]);
const ANALYSIS_NUMERIC_FIELDS = [
  "buy_price",
  "sell_price",
  "high",
  "sl",
  "c_low",
  "qty",
  "p_l",
];
const ANALYSIS_FIELDS = ["comment", "is_traded", ...ANALYSIS_NUMERIC_FIELDS];

function parseInteger(value, { name, defaultValue, minimum, maximum }) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return `${name} must be an integer.`;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return `${name} must be between ${minimum} and ${maximum}.`;
  }
  return parsed;
}

function isUtcDateTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function validateLiquiditySwingHistoryQuery(request, response, next) {
  const details = {};
  const includeDeleted = request.query.includeDeleted;
  const limit = parseInteger(request.query.limit, {
    name: "limit",
    defaultValue: DEFAULT_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
  });
  const offset = parseInteger(request.query.offset, {
    name: "offset",
    defaultValue: 0,
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
  });
  const lookback = parseInteger(request.query.lookback, {
    name: "lookback",
    minimum: 1,
    maximum: 1000,
  });
  const resolution = request.query.resolution;
  const optionType = request.query.optionType;
  const status = request.query.status;
  const traded = request.query.traded;
  const search = request.query.search;
  const pivotTimeFrom = request.query.pivotTimeFrom;
  const pivotTimeTo = request.query.pivotTimeTo;

  if (typeof limit === "string") {
    details.limit = limit;
  }
  if (typeof offset === "string") {
    details.offset = offset;
  }
  if (typeof lookback === "string") {
    details.lookback = lookback;
  }
  if (includeDeleted !== undefined && (
    typeof includeDeleted !== "string" || !["0", "1"].includes(includeDeleted)
  )) {
    details.includeDeleted = "Use 0 or 1.";
  }
  if (
    resolution !== undefined &&
    (typeof resolution !== "string" || !FYERS_HISTORICAL_RESOLUTIONS.has(resolution))
  ) {
    details.resolution = "Use a valid resolution.";
  }
  if (optionType !== undefined && !["CE", "PE"].includes(optionType)) {
    details.optionType = "Use CE or PE.";
  }
  if (status !== undefined && !HISTORY_STATUSES.has(status)) {
    details.status = "Use tracking, broken, or qualified.";
  }
  if (traded !== undefined && !["0", "1"].includes(traded)) {
    details.traded = "Use 0 for not traded or 1 for traded.";
  }
  if (
    search !== undefined &&
    (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH)
  ) {
    details.search = `Use a string with at most ${MAX_SEARCH_LENGTH} characters.`;
  }
  if (
    pivotTimeFrom !== undefined ||
    pivotTimeTo !== undefined
  ) {
    if (!isUtcDateTime(pivotTimeFrom) || !isUtcDateTime(pivotTimeTo)) {
      details.pivotTime = "Provide valid UTC start and end timestamps.";
    } else if (Date.parse(pivotTimeFrom) >= Date.parse(pivotTimeTo)) {
      details.pivotTime = "The start timestamp must be before the end timestamp.";
    }
  }

  if (Object.keys(details).length > 0) {
    response.status(400).json({
      error: "Invalid liquidity-swing history query.",
      details,
    });
    return;
  }

  response.locals.liquiditySwingHistoryQuery = {
    limit,
    offset,
    includeDeleted: includeDeleted === "1",
    ...(resolution ? { resolution } : {}),
    ...(optionType ? { optionType } : {}),
    ...(lookback ? { lookback } : {}),
    ...(status ? { status } : {}),
    ...(traded !== undefined ? { traded: traded === "1" } : {}),
    ...(search ? { search: search.trim() } : {}),
    ...(pivotTimeFrom ? { pivotTimeFrom, pivotTimeTo } : {}),
  };
  next();
}

export function validateLiquiditySwingHistoryUpdate(request, response, next) {
  const details = {};
  const id = typeof request.params.id === "string" && /^\d+$/.test(request.params.id)
    ? Number(request.params.id)
    : Number.NaN;
  const isDeleted = request.body?.is_deleted;

  if (!Number.isSafeInteger(id) || id < 1) {
    details.id = "Use a positive integer history ID.";
  }
  if (typeof isDeleted !== "boolean") {
    details.is_deleted = "Use a boolean value.";
  }

  if (Object.keys(details).length > 0) {
    response.status(400).json({
      error: "Invalid liquidity-swing history update.",
      details,
    });
    return;
  }

  response.locals.liquiditySwingHistoryUpdate = { id, isDeleted };
  next();
}

export function validateLiquiditySwingAnalysisUpdate(request, response, next) {
  const details = {};
  const id = typeof request.params.id === "string" && /^\d+$/.test(request.params.id)
    ? Number(request.params.id)
    : Number.NaN;
  const body = request.body;

  if (!Number.isSafeInteger(id) || id < 1) {
    details.id = "Use a positive integer history ID.";
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    details.body = "Provide an analysis object.";
  } else {
    for (const field of ANALYSIS_FIELDS) {
      if (!Object.hasOwn(body, field)) {
        details[field] = "Provide a value or null.";
      }
    }
    for (const field of Object.keys(body)) {
      if (!ANALYSIS_FIELDS.includes(field)) {
        details[field] = "This field is not editable.";
      }
    }

    if (
      Object.hasOwn(body, "comment") &&
      body.comment !== null &&
      (typeof body.comment !== "string" || body.comment.length > MAX_ANALYSIS_COMMENT_LENGTH)
    ) {
      details.comment = `Use text with at most ${MAX_ANALYSIS_COMMENT_LENGTH} characters, or null.`;
    }
    if (Object.hasOwn(body, "is_traded") && typeof body.is_traded !== "boolean") {
      details.is_traded = "Use a boolean value.";
    }
    for (const field of ANALYSIS_NUMERIC_FIELDS) {
      if (!Object.hasOwn(body, field) || body[field] === null) {
        continue;
      }
      if (typeof body[field] !== "number" || !Number.isFinite(body[field])) {
        details[field] = "Use a finite number or null.";
      } else if (field === "qty" && (!Number.isSafeInteger(body[field]) || body[field] < 0)) {
        details[field] = "Use a non-negative integer or null.";
      } else if (field !== "p_l" && body[field] < 0) {
        details[field] = "Use a non-negative number or null.";
      }
    }
  }

  if (Object.keys(details).length > 0) {
    response.status(400).json({
      error: "Invalid liquidity-swing analysis update.",
      details,
    });
    return;
  }

  response.locals.liquiditySwingAnalysisUpdate = {
    id,
    analysis: Object.fromEntries(ANALYSIS_FIELDS.map((field) => [field, body[field]])),
  };
  next();
}
