import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";
import liquiditySwingsRoutes from "./liquidity-swings.routes.js";

const router = Router();

router.get("/health", getHealth);
router.use("/liquidity-swings", liquiditySwingsRoutes);

export default router;
