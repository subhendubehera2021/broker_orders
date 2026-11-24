const fyersDataBaseUrl = "https://api-t1.fyers.in/data";
const intradayResolutions = new Set(["1", "2", "3", "5", "10", "15", "20", "30", "45", "60", "120", "180", "240"]);
const dailyResolutions = new Set(["D", "1D", "1W", "1M"]);
const validResolutions = new Set([...intradayResolutions, ...dailyResolutions]);
const optionChainSymbols = new Set(["NSE:NIFTY50-INDEX", "MCX:CRUDEOIL-INDEX"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function requiredNumber(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function isValidSymbol(symbol) {
  return (
    typeof symbol === "string" &&
    symbol.length <= 80 &&
    /^[A-Z0-9]+:[A-Z0-9][A-Z0-9_.&-]*$/.test(symbol)
  );
}

export class FyersMarketDataError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "FyersMarketDataError";
    this.statusCode = statusCode;
  }
}

export async function fetchFyersCandles(
  { appId, accessToken, symbol, resolution, rangeFrom, rangeTo },
  fetchImpl = fetch,
) {
  validateSymbol(symbol);
  validateResolution(resolution);
  validateDateRange(rangeFrom, rangeTo, resolution);

  const url = new URL(`${fyersDataBaseUrl}/history`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("date_format", "1");
  url.searchParams.set("range_from", rangeFrom);
  url.searchParams.set("range_to", rangeTo);
  url.searchParams.set("cont_flag", "1");

  const payload = await requestFyers(url, appId, accessToken, fetchImpl);
  if (payload.s !== "ok" || !Array.isArray(payload.candles)) {
    throw new FyersMarketDataError(502, "Fyers did not return historical candles for this request");
  }

  const candles = payload.candles.map((candle, index) => {
    if (!Array.isArray(candle) || candle.length < 6) {
      throw new FyersMarketDataError(502, `Fyers returned an invalid candle at row ${index}`);
    }

    const [time, open, high, low, close, volume] = candle.slice(0, 6).map(requiredNumber);
    if (
      [time, open, high, low, close, volume].some((value) => value === undefined) ||
      time <= 0 ||
      low > high ||
      low > Math.min(open, close) ||
      high < Math.max(open, close) ||
      volume < 0
    ) {
      throw new FyersMarketDataError(502, `Fyers returned invalid OHLCV values at row ${index}`);
    }
    return { time, open, high, low, close, volume };
  });
  candles.sort((left, right) => left.time - right.time);

  const uniqueCandles = [];
  for (const candle of candles) {
    if (uniqueCandles.at(-1)?.time === candle.time) {
      uniqueCandles[uniqueCandles.length - 1] = candle;
    } else {
      uniqueCandles.push(candle);
    }
  }
  return uniqueCandles;
}

export async function fetchFyersQuote({ appId, accessToken, symbol }, fetchImpl = fetch) {
  validateSymbol(symbol);
  const url = new URL(`${fyersDataBaseUrl}/quotes`);
  url.searchParams.set("symbols", symbol);
  const payload = await requestFyers(url, appId, accessToken, fetchImpl);
  const quote = Array.isArray(payload.d)
    ? payload.d.find((item) => item?.n === symbol && item.s === "ok")?.v
    : undefined;
  const price = requiredNumber(quote?.lp);
  const time = requiredNumber(quote?.tt);
  const volume = optionalNumber(quote?.volume);

  if (
    payload.s !== "ok" ||
    !quote ||
    price === undefined ||
    time === undefined
  ) {
    throw new FyersMarketDataError(502, "Fyers did not return a valid quote for this symbol");
  }

  return {
    symbol,
    price,
    volume,
    time,
  };
}

export async function fetchFyersOptionChain(
  { appId, accessToken, symbol = "NSE:NIFTY50-INDEX", strikeCount = 10, timestamp = "" },
  fetchImpl = fetch,
) {
  if (!optionChainSymbols.has(symbol)) {
    throw new FyersMarketDataError(400, "Unsupported option-chain underlying");
  }
  if (!Number.isSafeInteger(strikeCount) || strikeCount < 1 || strikeCount > 50) {
    throw new FyersMarketDataError(400, "Option-chain strike count must be between 1 and 50");
  }
  if (typeof timestamp !== "string" || (timestamp !== "" && !/^\d{1,12}$/.test(timestamp))) {
    throw new FyersMarketDataError(400, "Option-chain expiry timestamp is invalid");
  }

  const url = new URL(`${fyersDataBaseUrl}/options-chain-v3`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("strikecount", String(strikeCount));
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("greeks", "1");

  const payload = await requestFyers(url, appId, accessToken, fetchImpl);
  const data = payload.data;
  if (payload.s !== "ok" || !isRecord(data) || !Array.isArray(data.optionsChain)) {
    throw new FyersMarketDataError(502, "Fyers did not return a valid option chain");
  }

  const options = [];
  let underlyingPrice;
  for (const entry of data.optionsChain) {
    if (!isRecord(entry)) continue;
    const optionType = typeof entry.option_type === "string" ? entry.option_type.toUpperCase() : "";
    const symbol = entry.symbol;
    if (optionType === "" && underlyingPrice === undefined) {
      underlyingPrice = typeof symbol === "string" && symbol.startsWith("MCX:")
        ? optionalNumber(entry.fp) ?? optionalNumber(entry.ltp)
        : optionalNumber(entry.ltp);
      continue;
    }

    const strikePrice = optionalNumber(entry.strike_price);
    if (
      (optionType !== "CE" && optionType !== "PE") ||
      typeof symbol !== "string" ||
      !Number.isFinite(strikePrice) ||
      strikePrice <= 0
    ) {
      continue;
    }

    if (!isValidSymbol(symbol)) continue;
    options.push({
      symbol,
      optionType,
      strikePrice,
      ltp: optionalNumber(entry.ltp),
      ltpChange: optionalNumber(entry.ltpch),
      ltpChangePercent: optionalNumber(entry.ltpchp),
      openInterest: optionalNumber(entry.oi),
      openInterestChange: optionalNumber(entry.oich),
      volume: optionalNumber(entry.volume),
      bid: optionalNumber(entry.bid),
      ask: optionalNumber(entry.ask),
    });
  }

  if (!options.length) {
    throw new FyersMarketDataError(502, "Fyers returned no call or put contracts");
  }

  const expiries = Array.isArray(data.expiryData)
    ? data.expiryData.flatMap((expiry) => {
        if (
          !isRecord(expiry) ||
          typeof expiry.date !== "string" ||
          typeof expiry.expiry !== "string" ||
          !/^\d{1,12}$/.test(expiry.expiry)
        ) {
          return [];
        }
        return [{ date: expiry.date, timestamp: expiry.expiry }];
      })
    : [];

  return {
    symbol,
    underlyingPrice,
    callOpenInterest: optionalNumber(data.callOi),
    putOpenInterest: optionalNumber(data.putOi),
    expiries,
    options,
  };
}

async function requestFyers(url, appId, accessToken, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: `${appId}:${accessToken}`,
      Accept: "application/json",
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new FyersMarketDataError(502, "Fyers returned an unreadable market-data response");
  }

  if (!response.ok) {
    const statusCode = response.status === 401 || response.status === 403 ? 401 : 502;
    throw new FyersMarketDataError(
      statusCode,
      statusCode === 401
        ? "Fyers session expired; log in again"
        : `Fyers market-data request failed with HTTP ${response.status}`,
    );
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FyersMarketDataError(502, "Fyers returned an invalid market-data response");
  }
  if ([-8, -15, -16, -17].includes(Number(payload.code))) {
    throw new FyersMarketDataError(401, "Fyers session expired; log in again");
  }
  return payload;
}

function validateSymbol(symbol) {
  if (!isValidSymbol(symbol)) {
    throw new FyersMarketDataError(
      400,
      "Use a Fyers symbol such as NSE:SBIN-EQ or NSE:NIFTY50-INDEX",
    );
  }
}

function validateResolution(resolution) {
  if (typeof resolution !== "string" || !validResolutions.has(resolution)) {
    throw new FyersMarketDataError(400, "Unsupported candle interval");
  }
}

function validateDateRange(rangeFrom, rangeTo, resolution) {
  if (!isDateOnly(rangeFrom) || !isDateOnly(rangeTo) || rangeFrom > rangeTo) {
    throw new FyersMarketDataError(400, "Use a valid YYYY-MM-DD date range in ascending order");
  }
  const spanDays = (Date.parse(`${rangeTo}T00:00:00Z`) - Date.parse(`${rangeFrom}T00:00:00Z`)) /
    (24 * 60 * 60 * 1000);
  const maxDays = dailyResolutions.has(resolution) ? 366 : 100;
  if (spanDays + 1 > maxDays) {
    throw new FyersMarketDataError(400, `The selected interval supports up to ${maxDays} days per request`);
  }
}

function isDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
