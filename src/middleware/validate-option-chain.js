export function validateOptionChainQuery(request, response, next) {
  const query = request.query;
  const errors = {};

  if (typeof query.symbol !== "string" || query.symbol.trim() === "") {
    errors.symbol = "A single symbol is required.";
  }

  const optionChainQuery = {
    symbol: typeof query.symbol === "string" ? query.symbol.trim() : "",
    timestamp: "",
  };

  if (query.strikecount !== undefined) {
    if (!/^\d+$/.test(query.strikecount)) {
      errors.strikecount = "Use an integer between 1 and 50.";
    } else {
      const strikecount = Number(query.strikecount);
      if (strikecount < 1 || strikecount > 50) {
        errors.strikecount = "Use an integer between 1 and 50.";
      } else {
        optionChainQuery.strikecount = strikecount;
      }
    }
  }

  if (query.timestamp !== undefined) {
    if (typeof query.timestamp !== "string") {
      errors.timestamp = "Use a single timestamp value.";
    } else {
      optionChainQuery.timestamp = query.timestamp;
    }
  }

  if (query.greeks !== undefined) {
    if (!["0", "1"].includes(query.greeks)) {
      errors.greeks = "Use 0 or 1.";
    } else {
      optionChainQuery.greeks = Number(query.greeks);
    }
  }

  if (Object.keys(errors).length > 0) {
    return response.status(400).json({
      error: "Invalid option-chain query.",
      details: errors,
    });
  }

  response.locals.optionChainQuery = optionChainQuery;
  next();
}
