import { callLiquiditySwingApi } from "./liquidity-swing-api.js";
import { orderWebSocketDashboard } from "./order-websocket-dashboard.js";
import { KotakOrderStream } from "./order-websocket.js";

const orderStreamPath = "/internal/order-stream/start";
const orderStreamStatusPath = "/internal/order-stream/status";
const orderStreamEventsPath = "/internal/order-stream/events";
const orderStreamCron = "*/1 * * * *";

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

function formatIST(timestamp) {
  return `${istDateTime.format(new Date(timestamp))} IST`;
}

async function callOrderStream(env, path, method) {
  const id = env.ORDER_STREAM.idFromName("kotak-order-stream");
  return env.ORDER_STREAM.get(id).fetch(`https://order-stream.internal${path}`, { method });
}

async function startOrderStream(env) {
  const response = await callOrderStream(env, "/start", "POST");
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? `Order stream start failed with status ${response.status}`);
  }
  const { state } = await response.clone().json();
  console.log(`[order-websocket] supervisor state=${state}`);
  return response;
}

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export { KotakOrderStream };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(orderWebSocketDashboard, {
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
    const isStatus = url.pathname === orderStreamStatusPath && request.method === "GET";
    const isEvents = url.pathname === orderStreamEventsPath && request.method === "GET";
    if (!isStart && !isStatus && !isEvents) return new Response("Not found", { status: 404 });
    if (!isAuthorized(request, env.ORDER_STREAM_CONTROL_TOKEN)) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (isStart) return startOrderStream(env);
    return callOrderStream(env, isStatus ? "/status" : "/events", "GET");
  },

  async scheduled(controller, env) {
    if (controller.cron === orderStreamCron) {
      await startOrderStream(env);
      return;
    }

    const scheduledMinute = Math.floor(controller.scheduledTime / 60_000) * 60_000;
    const scheduledFor = scheduledMinute + 59_000;
    const delay = scheduledFor - Date.now();
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    console.log(
      `[nifty-cron] cron=${controller.cron}` +
        ` scheduledForIST=${formatIST(scheduledFor)}` +
        ` startedAtIST=${formatIST(Date.now())}`,
    );

    const status = await callLiquiditySwingApi(env.LIQUIDITY_SWING_API_TOKEN);
    console.log(`[nifty-cron] liquidity-swing-api status=${status}`);
  },
};
