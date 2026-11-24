const DEFAULT_AUTO_SELL_API_URL = "https://trade.brinto.in/api/orders/sell-sl-limit";
const AUTO_SELL_OFFSET = 3;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AutoSellManager {
  constructor(ctx, env, fetchImpl = globalThis.fetch) {
    this.ctx = ctx;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.pendingOrders = new Map();
  }

  schedule(message) {
    if (this.env.AUTO_SELL_ENABLED === "false") return;
    const data = message.data;
    if (
      !isRecord(data) ||
      typeof data.trnsTp !== "string" ||
      data.trnsTp.toUpperCase() !== "B"
    ) {
      return;
    }

    const orderId = typeof data.nOrdNo === "string" ? data.nOrdNo.trim() : "";
    const quantity = Number(data.fldQty);
    const averagePrice = Number(data.avgPrc);

    if (orderId === "" || !Number.isSafeInteger(quantity) || quantity < 0) {
      console.error(
        "[auto-sell] BUY fill is missing valid fields",
        { orderId, quantity },
      );
      return;
    }
    if (quantity === 0) return;
    if (!Number.isFinite(averagePrice) || averagePrice <= 0) {
      console.error(
        "[auto-sell] BUY fill is missing a valid average price",
        { orderId, quantity, averagePrice },
      );
      return;
    }

    const previousTask = this.pendingOrders.get(orderId) ?? Promise.resolve();
    const task = previousTask
      .then(() => this.submit(orderId, data))
      .catch((error) => {
        console.error(`[auto-sell] submission failed for buy order ${orderId}`, error);
      });
    this.pendingOrders.set(orderId, task);
    task.finally(() => {
      if (this.pendingOrders.get(orderId) === task) {
        this.pendingOrders.delete(orderId);
      }
    });

    if (typeof this.ctx.waitUntil === "function") {
      this.ctx.waitUntil(task);
    }
  }

  async submit(orderId, data) {
    const storage = this.ctx?.storage;
    if (typeof storage?.get !== "function" || typeof storage?.put !== "function") {
      throw new Error("Durable Object storage is required to deduplicate automatic sells");
    }
    if (typeof this.fetchImpl !== "function") {
      throw new Error("Fetch is unavailable for automatic sell submission");
    }

    const key = `autoSell:${orderId}`;
    const previous = await storage.get(key);
    if (previous && !Number.isSafeInteger(previous.filledQty)) {
      console.warn(`[auto-sell] legacy record prevents resubmission for buy order ${orderId}`);
      return;
    }

    const reportedQuantity = Number(data.fldQty);
    const previousQuantity = previous?.filledQty ?? 0;
    if (reportedQuantity <= previousQuantity) return;

    const cumulativeAveragePrice = Number(data.avgPrc);
    const incrementalQuantity = reportedQuantity - previousQuantity;
    const previousAveragePrice = previousQuantity > 0 ? Number(previous.averagePrice) : 0;
    const incrementalAveragePrice = previousQuantity === 0
      ? cumulativeAveragePrice
      : (
        cumulativeAveragePrice * reportedQuantity -
        previousAveragePrice * previousQuantity
      ) / incrementalQuantity;
    const sellPrice = Math.round((incrementalAveragePrice - AUTO_SELL_OFFSET) * 100) / 100;
    const tradingSymbol =
      [data.trdSym, data.sym, previous?.tradingSymbol]
        .find((value) => typeof value === "string" && value.trim() !== "") ?? "";
    const product =
      [data.prod, previous?.product]
        .find((value) => typeof value === "string" && value.trim() !== "") ?? "";

    if (
      !Number.isSafeInteger(previousQuantity) ||
      previousQuantity < 0 ||
      (previousQuantity > 0 && !Number.isFinite(previousAveragePrice)) ||
      tradingSymbol === "" ||
      product === "" ||
      !Number.isFinite(incrementalAveragePrice) ||
      sellPrice <= 0
    ) {
      throw new Error(`BUY fill data is invalid for automatic sell order ${orderId}`);
    }

    const endpoint = this.env.AUTO_SELL_API_URL ?? DEFAULT_AUTO_SELL_API_URL;
    let parsedEndpoint;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      throw new Error("AUTO_SELL_API_URL must be a valid HTTPS URL");
    }
    if (parsedEndpoint.protocol !== "https:") {
      throw new Error("AUTO_SELL_API_URL must be a valid HTTPS URL");
    }

    const payload = {
      tradingSymbol: tradingSymbol.trim(),
      quantity: String(incrementalQuantity),
      triggerPrice: sellPrice.toFixed(2),
      price: sellPrice.toFixed(2),
      product,
      tag: `as3-${orderId}-${reportedQuantity}`,
    };
    const attempt = {
      filledQty: reportedQuantity,
      averagePrice: cumulativeAveragePrice,
      tradingSymbol,
      product,
      tag: payload.tag,
    };
    await storage.put(key, {
      ...attempt,
      state: "submitting",
      startedAt: new Date().toISOString(),
    });
    const response = await this.fetchImpl(parsedEndpoint.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      await storage.put(key, {
        ...attempt,
        state: "failed",
        status: response.status,
        attemptedAt: new Date().toISOString(),
      });
      throw new Error(`Automatic sell endpoint returned HTTP ${response.status}`);
    }

    await storage.put(key, {
      ...attempt,
      state: "submitted",
      status: response.status,
      submittedAt: new Date().toISOString(),
    });
    console.log(
      `[auto-sell] submitted for buy order ${orderId} quantity=${incrementalQuantity}`,
    );
  }
}
