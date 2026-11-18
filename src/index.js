import { marketPricePage } from "./market-price/market-price-page.js";
import { KotakMarketPriceStream } from "./market-price/market-price-stream.js";
import { orderWebSocketDashboard } from "./order-websocket-dashboard.js";
import { KotakOrderStream } from "./order-websocket.js";

const orderStreamPath = "/internal/order-stream/start";
const orderStreamDisconnectPath = "/internal/order-stream/disconnect";
const orderStreamStatusPath = "/internal/order-stream/status";
const orderStreamEventsPath = "/internal/order-stream/events";
const marketPriceEventsPath = "/internal/market-price/events";
const marketPriceInstrumentsPath = "/internal/market-price/instruments";
const marketPriceSubscribePath = "/internal/market-price/subscribe";
const marketPriceUnsubscribePath = "/internal/market-price/unsubscribe";
const marketPriceRestartPath = "/internal/market-price/restart";
const marketPriceDisconnectPath = "/internal/market-price/disconnect";
function isAuthorized(request, secret) {
  const authorization = request.headers.get("Authorization");
  if (typeof secret !== "string" || secret.trim() === "" || !authorization?.startsWith("Bearer ")) {
    return false;
  }
  const actual = new TextEncoder().encode(authorization.slice(7));
  const expected = new TextEncoder().encode(secret);
  let mismatch = actual.length ^ expected.length;
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    mismatch |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return mismatch === 0;
}

async function callOrderStream(env, path, method) {
  const id = env.ORDER_STREAM.idFromName("kotak-order-stream");
  return env.ORDER_STREAM.get(id).fetch(`https://order-stream.internal${path}`, { method });
}

async function callMarketPriceStream(env, instrument) {
  const id = env.MARKET_PRICE_STREAM.idFromName("kotak-market-price-stream");
  const path = instrument
    ? `/events?instrument=${encodeURIComponent(instrument)}`
    : "/events";
  return env.MARKET_PRICE_STREAM.get(id).fetch(`https://market-price.internal${path}`, {
    method: "GET",
  });
}

async function callMarketPriceControl(env, path, method) {
  const id = env.MARKET_PRICE_STREAM.idFromName("kotak-market-price-stream");
  return env.MARKET_PRICE_STREAM.get(id).fetch(`https://market-price.internal${path}`, {
    method,
  });
}

async function ensureDefaultMarketPriceStream(env) {
  const id = env.MARKET_PRICE_STREAM.idFromName("kotak-market-price-stream");
  const response = await env.MARKET_PRICE_STREAM.get(id).fetch(
    "https://market-price.internal/ensure-default",
    { method: "POST" },
  );
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? `Market-price stream start failed with status ${response.status}`);
  }
  const { state } = await response.json();
  console.log(`[market-price] supervisor state=${state}`);
  return response;
}

async function startOrderStream(env, { automatic = false } = {}) {
  const response = await callOrderStream(env, automatic ? "/start?automatic=1" : "/start", "POST");
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? `Order stream start failed with status ${response.status}`);
  }
  const { state } = await response.clone().json();
  console.log(`[order-websocket] supervisor state=${state}`);
  return response;
}

async function disconnectOrderStream(env) {
  const response = await callOrderStream(env, "/disconnect", "POST");
  if (!response.ok) {
    let errorMessage = `Order stream disconnect failed with status ${response.status}`;
    try {
      const result = await response.json();
      if (result?.error) errorMessage = result.error;
    } catch {
      // response body was not JSON or empty
    }
    throw new Error(errorMessage);
  }
  const { state } = await response.clone().json();
  console.log(`[order-websocket] supervisor state=${state}`);
  return response;
}

export { KotakMarketPriceStream, KotakOrderStream };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/live-price")
    ) {
      const marketPriceStartup = ensureDefaultMarketPriceStream(env).catch((error) => {
        console.error("[market-price] unable to start on page request", error);
      });
      if (typeof ctx?.waitUntil === "function") {
        ctx.waitUntil(marketPriceStartup);
      } else {
        await marketPriceStartup;
      }
      return new Response(url.pathname === "/live-price" ? marketPricePage : orderWebSocketDashboard, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const isStart = url.pathname === orderStreamPath && request.method === "POST";
    const isDisconnect = url.pathname === orderStreamDisconnectPath && request.method === "POST";
    const isStatus = url.pathname === orderStreamStatusPath && request.method === "GET";
    const isEvents = url.pathname === orderStreamEventsPath && request.method === "GET";
    const isMarketPriceEvents = url.pathname === marketPriceEventsPath && request.method === "GET";
    const isMarketPriceInstruments =
      url.pathname === marketPriceInstrumentsPath && request.method === "GET";
    const isMarketPriceSubscribe =
      url.pathname === marketPriceSubscribePath && request.method === "POST";
    const isMarketPriceUnsubscribe =
      url.pathname === marketPriceUnsubscribePath && request.method === "POST";
    const isMarketPriceRestart =
      url.pathname === marketPriceRestartPath && request.method === "POST";
    const isMarketPriceDisconnect =
      url.pathname === marketPriceDisconnectPath && request.method === "POST";
    if (
      !isStart &&
      !isDisconnect &&
      !isStatus &&
      !isEvents &&
      !isMarketPriceEvents &&
      !isMarketPriceInstruments &&
      !isMarketPriceSubscribe &&
      !isMarketPriceUnsubscribe &&
      !isMarketPriceRestart &&
      !isMarketPriceDisconnect
    ) {
      return new Response("Not found", { status: 404 });
    }
    if (!isAuthorized(request, env.ORDER_STREAM_CONTROL_TOKEN)) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (isStart) return startOrderStream(env);
    if (isDisconnect) return disconnectOrderStream(env);
    if (isMarketPriceEvents) {
      return callMarketPriceStream(env, url.searchParams.get("instrument"));
    }
    if (isMarketPriceInstruments) {
      return callMarketPriceControl(env, "/instruments", "GET");
    }
    if (isMarketPriceRestart) {
      return callMarketPriceControl(env, "/restart", "POST");
    }
    if (isMarketPriceDisconnect) {
      return callMarketPriceControl(env, "/disconnect", "POST");
    }
    if (isMarketPriceSubscribe || isMarketPriceUnsubscribe) {
      const instrument = url.searchParams.get("instrument");
      if (!instrument) return new Response("Missing instrument", { status: 400 });
      const path = isMarketPriceSubscribe ? "/subscribe" : "/unsubscribe";
      // A dashboard "Add" is an explicit user action, so it may resume a manually disconnected feed.
      const resume = isMarketPriceSubscribe ? "&resume=1" : "";
      return callMarketPriceControl(
        env,
        `${path}?instrument=${encodeURIComponent(instrument)}${resume}`,
        "POST",
      );
    }
    return callOrderStream(env, isStatus ? "/status" : "/events", "GET");
  },

  async scheduled(_controller, env) {
    await Promise.all([
      startOrderStream(env, { automatic: true }),
      ensureDefaultMarketPriceStream(env),
    ]);
  },
};
