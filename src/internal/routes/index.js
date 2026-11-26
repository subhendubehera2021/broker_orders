import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";
import liquiditySwingHistoryRoutes from "./liquidity-swing-history.routes.js";
import liquiditySwingsRoutes from "./liquidity-swings.routes.js";
import optionChainRoutes from "./option-chain.routes.js";

const router = Router();

router.get("/health", getHealth);
router.use("/liquidity-swing-history", liquiditySwingHistoryRoutes);
router.use("/liquidity-swings", liquiditySwingsRoutes);
router.use("/option-chain", optionChainRoutes);

export default router;
