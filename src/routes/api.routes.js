import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";
import marketDataRoutes from "./market-data.routes.js";

const router = Router();

router.get("/health", getHealth);
router.use("/market-data", marketDataRoutes);

export default router;
