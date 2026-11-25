import express from "express";
import apiRoutes from "./routes/api.routes.js";
import swaggerRouter from "./docs/swagger.js";

const app = express();

app.get("/", (_request, response) => {
  response.json({
    name: "Auto Trade Processor API",
    docs: "/docs",
    endpoints: {
      health: "/api/health",
      historicalData: "/api/market-data/historical-data",
    },
  });
});

app.use(express.json());
app.use("/api", apiRoutes);
app.use("/docs", swaggerRouter);

export default app;
