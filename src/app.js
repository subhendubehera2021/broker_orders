import express from "express";
import { fileURLToPath } from "node:url";
import apiRoutes from "./api.routes.js";
import swaggerRouter from "./docs/swagger.js";

const app = express();
const uiDirectory = fileURLToPath(new URL("../public/ui/", import.meta.url));
const lightweightChartsBundle = fileURLToPath(
  new URL("../node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js", import.meta.url),
);

app.get("/", (_request, response) => {
  response.json({
    name: "Auto Trade Processor API",
    docs: "/docs",
    ui: "/ui/",
    endpoints: {
      fyers: {
        expiredFoData: "/api/fyers/market-data/expired-fo-data",
        expiredFoContracts: "/api/fyers/market-data/expired-fo-data/contracts",
        expiredFoExpiryDates: "/api/fyers/market-data/expired-fo-data/expiry-dates",
        historicalData: "/api/fyers/market-data/historical-data",
        optionChain: "/api/fyers/market-data/option-chain",
        quotes: "/api/fyers/market-data/quotes",
      },
      internal: {
        health: "/api/internal/health",
        liquiditySwingHistory: "/api/internal/liquidity-swing-history",
        liquiditySwings: "/api/internal/liquidity-swings",
        highestVolumeOptions: "/api/internal/option-chain/highest-volume",
      },
      deltaExchange: {
        authStatus: "/api/deltaexchange/auth/status",
        testAuthentication: "/api/deltaexchange/auth/test",
        btcUsdOneMinuteCandles: "/api/deltaexchange/market-data/candles",
      },
      autoTradeProcess: "/api/auto-trade-process",
    },
  });
});

app.use(express.json());
app.use("/api", apiRoutes);
app.use("/docs", swaggerRouter);
app.get("/vendor/lightweight-charts.js", (_request, response) => {
  response.sendFile(lightweightChartsBundle);
});
app.use("/ui", express.static(uiDirectory));

export default app;
