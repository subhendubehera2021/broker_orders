import express from "express";
import apiRoutes from "./api.routes.js";
import swaggerRouter from "./docs/swagger.js";

const app = express();

app.get("/", (_request, response) => {
  response.json({
    name: "Auto Trade Processor API",
    docs: "/docs",
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
        liquiditySwings: "/api/internal/liquidity-swings",
        highestVolumeOptions: "/api/internal/option-chain/highest-volume",
      },
      autoTradeProcess: "/api/auto-trade-process",
    },
  });
});

app.use(express.json());
app.use("/api", apiRoutes);
app.use("/docs", swaggerRouter);

export default app;
