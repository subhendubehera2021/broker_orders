const MAX_SYMBOLS = 50;

export function validateQuotesQuery(request, response, next) {
  const { symbols: symbolsParameter } = request.query;

  if (typeof symbolsParameter !== "string" || symbolsParameter.trim() === "") {
    return response.status(400).json({
      error: "Invalid quotes query.",
      details: {
        symbols: "Provide one or more comma-separated symbols.",
      },
    });
  }

  const symbols = symbolsParameter.split(",").map((symbol) => symbol.trim());
  const errors = {};

  if (symbols.some((symbol) => symbol === "")) {
    errors.symbols = "Symbols must not be empty.";
  } else if (symbols.length > MAX_SYMBOLS) {
    errors.symbols = `A maximum of ${MAX_SYMBOLS} symbols is allowed.`;
  }

  if (Object.keys(errors).length > 0) {
    return response.status(400).json({
      error: "Invalid quotes query.",
      details: errors,
    });
  }

  response.locals.quoteSymbols = symbols;
  next();
}
