import { Router } from "express";
import { getHealth } from "./internal/controllers/health.controller.js";
import fyersRoutes from "./fyers/routes/index.js";
import fyersMarketDataRoutes from "./fyers/routes/market-data.routes.js";
import internalRoutes from "./internal/routes/index.js";
import internalLiquiditySwingsRoutes from "./internal/routes/liquidity-swings.routes.js";

const router = Router();

router.get("/health", getHealth);
router.use("/fyers", fyersRoutes);
router.use("/internal", internalRoutes);

router.use("/market-data", fyersMarketDataRoutes);
router.use("/liquidity-swings", internalLiquiditySwingsRoutes);

export default router;
