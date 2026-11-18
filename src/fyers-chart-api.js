import {
  clearFyersSessionCookie,
  getFyersConfig,
  getFyersSessionToken,
} from "./fyers-auth.js";
import {
  fetchFyersCandles,
  fetchFyersNiftyOptionChain,
  fetchFyersQuote,
  FyersMarketDataError,
} from "./fyers-market-data.js";

export function registerFyersChartRoutes(app) {
  app.get("/api/fyers/candles", async (request, reply) => {
    const config = getFyersConfig();
    if (!config) {
      return reply.code(503).send({ error: "Fyers is not configured on the server" });
    }

    const accessToken = getFyersSessionToken(request, config);
    if (!accessToken) {
      return reply.code(401).send({ error: "Log in with Fyers to load chart data" });
    }

    const { symbol, resolution, from, to } = request.query ?? {};
    try {
      const candles = await fetchFyersCandles(
        {
          appId: config.appId,
          accessToken,
          symbol,
          resolution,
          rangeFrom: from,
          rangeTo: to,
        },
      );
      return reply.send({ symbol, resolution, candles });
    } catch (error) {
      if (error instanceof FyersMarketDataError) {
        if (error.statusCode === 401) {
          reply.header("Set-Cookie", clearFyersSessionCookie(config.redirectUri));
        }
        return reply.code(error.statusCode).send({ error: error.message });
      }
      console.error("[fyers-chart] Historical data request failed", error);
      return reply.code(502).send({ error: "Unable to load Fyers historical candles" });
    }
  });

  app.get("/api/fyers/quote", async (request, reply) => {
    const config = getFyersConfig();
    if (!config) {
      return reply.code(503).send({ error: "Fyers is not configured on the server" });
    }

    const accessToken = getFyersSessionToken(request, config);
    if (!accessToken) {
      return reply.code(401).send({ error: "Log in with Fyers to load live quotes" });
    }

    try {
      const quote = await fetchFyersQuote(
        { appId: config.appId, accessToken, symbol: request.query?.symbol },
      );
      return reply.send(quote);
    } catch (error) {
      if (error instanceof FyersMarketDataError) {
        if (error.statusCode === 401) {
          reply.header("Set-Cookie", clearFyersSessionCookie(config.redirectUri));
        }
        return reply.code(error.statusCode).send({ error: error.message });
      }
      console.error("[fyers-chart] Quote request failed", error);
      return reply.code(502).send({ error: "Unable to load Fyers quote" });
    }
  });

  app.get("/api/fyers/options-chain", async (request, reply) => {
    const config = getFyersConfig();
    if (!config) {
      return reply.code(503).send({ error: "Fyers is not configured on the server" });
    }

    const accessToken = getFyersSessionToken(request, config);
    if (!accessToken) {
      return reply.code(401).send({ error: "Log in with Fyers to load the NIFTY option chain" });
    }

    const query = request.query ?? {};
    try {
      const optionChain = await fetchFyersNiftyOptionChain({
        appId: config.appId,
        accessToken,
        strikeCount: query.strikecount === undefined ? 10 : Number(query.strikecount),
        timestamp: query.timestamp ?? "",
      });
      return reply.send(optionChain);
    } catch (error) {
      if (error instanceof FyersMarketDataError) {
        if (error.statusCode === 401) {
          reply.header("Set-Cookie", clearFyersSessionCookie(config.redirectUri));
        }
        return reply.code(error.statusCode).send({ error: error.message });
      }
      console.error("[fyers-chart] Option-chain request failed", error);
      return reply.code(502).send({ error: "Unable to load the NIFTY option chain" });
    }
  });
}
