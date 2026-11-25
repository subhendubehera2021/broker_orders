import { FYERS_HISTORICAL_RESOLUTIONS } from "../constants/fyers-market-data.js";
import { isValidDateOnly } from "../../utils/date.js";

function isValidEpoch(value) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

export function validateHistoricalDataQuery(request, response, next) {
  const query = request.query;
  const errors = {};
  const values = {};

  for (const field of ["symbol", "resolution", "date_format", "range_from", "range_to"]) {
    const value = query[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors[field] = "This query parameter is required.";
    } else {
      values[field] = value.trim();
    }
  }

  if (values.resolution && !FYERS_HISTORICAL_RESOLUTIONS.has(values.resolution)) {
    errors.resolution = "Unsupported candle resolution.";
  }

  if (values.date_format && !["0", "1"].includes(values.date_format)) {
    errors.date_format = "Use 0 for epoch timestamps or 1 for YYYY-MM-DD dates.";
  }

  if (values.date_format === "0") {
    for (const field of ["range_from", "range_to"]) {
      if (values[field] && !isValidEpoch(values[field])) {
        errors[field] = "Use an epoch timestamp in seconds when date_format is 0.";
      }
    }

    if (
      values.range_from && isValidEpoch(values.range_from) &&
      values.range_to && isValidEpoch(values.range_to) &&
      Number(values.range_from) >= Number(values.range_to)
    ) {
      errors.range_to = "Must be later than range_from.";
    }
  } else if (values.date_format === "1") {
    for (const field of ["range_from", "range_to"]) {
      if (values[field] && !isValidDateOnly(values[field])) {
        errors[field] = "Use a valid YYYY-MM-DD date when date_format is 1.";
      }
    }

    if (
      values.range_from && isValidDateOnly(values.range_from) &&
      values.range_to && isValidDateOnly(values.range_to) &&
      values.range_from >= values.range_to
    ) {
      errors.range_to = "Must be later than range_from.";
    }
  }

  for (const field of ["cont_flag", "oi_flag"]) {
    if (query[field] !== undefined) {
      if (typeof query[field] !== "string" || !["0", "1"].includes(query[field])) {
        errors[field] = "Use 0 or 1.";
      } else {
        values[field] = query[field];
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return response.status(400).json({
      error: "Invalid historical-data query.",
      details: errors,
    });
  }

  response.locals.historicalDataQuery = values;
  next();
}
