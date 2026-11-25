function parseLtp(value, field, errors) {
  if (value === undefined) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
  ) {
    errors[field] = "Use a non-negative number.";
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors[field] = "Use a finite number.";
    return undefined;
  }
  return parsed;
}

export function validateLtpRange(request, response, next) {
  const errors = {};
  const ltpMin = parseLtp(request.query.ltpMin, "ltpMin", errors);
  const ltpMax = parseLtp(request.query.ltpMax, "ltpMax", errors);

  if (ltpMin !== null && ltpMax !== null && ltpMin > ltpMax) {
    errors.ltpMax = "Must be greater than or equal to ltpMin.";
  }

  if (Object.keys(errors).length > 0) {
    return response.status(400).json({
      error: "Invalid LTP range.",
      details: errors,
    });
  }

  response.locals.ltpRange = { ltpMin, ltpMax };
  next();
}
