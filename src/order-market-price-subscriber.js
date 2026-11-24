import { parseMarketInstrument } from "./market-price/market-price-stream.js";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class OrderMarketPriceSubscriber {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.pendingSubscriptions = new Set();
  }

  subscribe(message) {
    const data = message.data;
    if (!isRecord(data)) return;
    const hasExchange = Object.hasOwn(data, "exSeg");
    const hasToken = Object.hasOwn(data, "tok");
    if (!hasExchange && !hasToken) return;
    if (
      typeof data.exSeg !== "string" ||
      (typeof data.tok !== "string" && typeof data.tok !== "number")
    ) {
      console.warn("[order-websocket] order is missing exSeg or tok; market-price subscription skipped");
      return;
    }

    let inputToken;
    try {
      inputToken = parseMarketInstrument(`${data.exSeg}|${data.tok}`).inputToken;
    } catch (error) {
      console.warn("[order-websocket] order has an unsupported market instrument", error.message);
      return;
    }
    if (this.pendingSubscriptions.has(inputToken)) return;

    const marketPriceStream = this.env.MARKET_PRICE_STREAM;
    if (!marketPriceStream) {
      console.error("[order-websocket] market-price Durable Object binding is unavailable");
      return;
    }

    this.pendingSubscriptions.add(inputToken);
    const request = Promise.resolve().then(() => {
      const id = marketPriceStream.idFromName("kotak-market-price-stream");
      return marketPriceStream.get(id).fetch(
        `https://market-price.internal/subscribe?instrument=${encodeURIComponent(inputToken)}`,
        { method: "POST" },
      );
    }).then(async (response) => {
      if (response.ok) {
        console.log(`[order-websocket] market-price subscription accepted instrument=${inputToken}`);
        return;
      }
      const result = await response.json().catch(() => ({}));
      throw new Error(
        result.error ?? `Market-price subscription failed with status ${response.status}`,
      );
    }).catch((error) => {
      console.error(
        `[order-websocket] unable to subscribe ${inputToken} to live prices`,
        error,
      );
    }).finally(() => {
      this.pendingSubscriptions.delete(inputToken);
    });

    if (typeof this.ctx.waitUntil === "function") {
      this.ctx.waitUntil(request);
    }
  }
}
