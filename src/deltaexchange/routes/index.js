import { Router } from "express";
import authRoutes from "./auth.routes.js";
import marketDataRoutes from "./market-data.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/market-data", marketDataRoutes);

export default router;
