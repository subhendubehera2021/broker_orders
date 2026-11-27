import { createRequire } from "node:module";
import { WebSocket, WebSocketServer } from "ws";
import { parseFyersLiveTick } from "../lib/live-candles.js";

const require = createRequire(import.meta.url);
const FyersDataSocket = require("fyers-api-v3").fyersDataSocket;
const liveChartPath = "/api/live-chart";
const supportedIntervals = new Set(["1", "3", "5", "15"]);

function send(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function sendError(client, message) {
  send(client, { type: "error", message });
}

function isValidSubscription(message) {
  return message &&
    message.type === "subscribe" &&
    typeof message.symbol === "string" &&
    /^[A-Za-z0-9]+:[A-Za-z0-9._-]+$/.test(message.symbol) &&
    supportedIntervals.has(message.resolution);
}

export function attachLiveChartWebSocket(server) {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
  });
  const symbolClients = new Map();
  const clientSymbols = new Map();
  const upstreamSubscriptions = new Set();
  let upstream;
  let upstreamReady = false;

  function sendToSymbol(symbol, message) {
    for (const client of symbolClients.get(symbol) ?? []) {
      send(client, message);
    }
  }

  function sendToClients(message) {
    for (const client of webSocketServer.clients) {
      send(client, message);
    }
  }

  function subscribeToSymbol(symbol) {
    if (!upstreamReady) {
      return;
    }
    if (upstreamSubscriptions.has(symbol)) {
      sendToSymbol(symbol, { type: "status", status: "subscribed" });
      return;
    }
    try {
      upstream.subscribe([symbol]);
      upstreamSubscriptions.add(symbol);
      sendToSymbol(symbol, { type: "status", status: "subscribed" });
    } catch {
      sendToSymbol(symbol, {
        type: "error",
        message: "Could not subscribe to the Fyers live feed.",
      });
    }
  }

  function ensureUpstream(client) {
    if (upstream) {
      return true;
    }

    const appId = process.env.FYERS_APP_ID?.trim();
    const accessToken = process.env.FYERS_ACCESS_TOKEN?.trim();
    if (!appId || !accessToken) {
      sendError(client, "Fyers live feed credentials are not configured on the server.");
      return false;
    }

    try {
      const fyersSocket = new FyersDataSocket(`${appId}:${accessToken}`, undefined, false);
      upstream = fyersSocket;
      fyersSocket.on("connect", () => {
        if (upstream !== fyersSocket) {
          return;
        }
        upstreamReady = true;
        upstreamSubscriptions.clear();
        for (const symbol of symbolClients.keys()) {
          subscribeToSymbol(symbol);
        }
      });
      fyersSocket.on("message", (message) => {
        if (upstream !== fyersSocket) {
          return;
        }
        const tick = parseFyersLiveTick(message);
        if (tick && symbolClients.has(tick.symbol)) {
          sendToSymbol(tick.symbol, { type: "tick", data: tick });
        }
      });
      fyersSocket.on("error", () => {
        if (upstream === fyersSocket) {
          sendToClients({
            type: "error",
            message: "Fyers live feed connection failed.",
          });
        }
      });
      fyersSocket.on("close", () => {
        if (upstream === fyersSocket) {
          upstreamReady = false;
          upstreamSubscriptions.clear();
          sendToClients({ type: "status", status: "disconnected" });
        }
      });
      fyersSocket.autoreconnect();
      fyersSocket.connect();
      return true;
    } catch {
      upstream = undefined;
      upstreamReady = false;
      sendError(client, "Could not start the Fyers live feed.");
      return false;
    }
  }

  function removeClientSubscription(client) {
    const symbol = clientSymbols.get(client);
    if (!symbol) {
      return;
    }
    clientSymbols.delete(client);
    const clients = symbolClients.get(symbol);
    clients?.delete(client);
    if (clients?.size > 0) {
      return;
    }

    symbolClients.delete(symbol);
    if (upstreamReady && upstreamSubscriptions.has(symbol)) {
      try {
        upstream.unsubscribe([symbol]);
        upstreamSubscriptions.delete(symbol);
      } catch {
        sendToClients({
          type: "error",
          message: "Could not unsubscribe from the Fyers live feed.",
        });
      }
    }
  }

  server.on("upgrade", (request, socket, head) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url, `http://${request.headers.host}`);
    } catch {
      socket.destroy();
      return;
    }

    if (requestUrl.pathname !== liveChartPath) {
      socket.destroy();
      return;
    }

    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }

    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit("connection", client, request);
    });
  });

  webSocketServer.on("connection", (client) => {
    client.on("message", (data) => {
      let subscription;
      try {
        subscription = JSON.parse(data.toString("utf8"));
      } catch {
        sendError(client, "Live chart subscription must be valid JSON.");
        return;
      }

      if (!isValidSubscription(subscription)) {
        sendError(client, "Provide a valid symbol and a 1m, 3m, 5m, or 15m interval.");
        return;
      }

      const symbol = subscription.symbol.trim();
      if (!ensureUpstream(client)) {
        return;
      }

      removeClientSubscription(client);
      clientSymbols.set(client, symbol);
      if (!symbolClients.has(symbol)) {
        symbolClients.set(symbol, new Set());
      }
      symbolClients.get(symbol).add(client);
      send(client, { type: "status", status: "connecting" });
      subscribeToSymbol(symbol);
    });

    client.on("close", () => removeClientSubscription(client));
    client.on("error", () => removeClientSubscription(client));
  });

  server.once("close", () => upstream?.close());
  return webSocketServer;
}
