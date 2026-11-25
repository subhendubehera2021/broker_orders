import { Router } from "express";
import marketDataRoutes from "./market-data.routes.js";

const router = Router();

router.use("/market-data", marketDataRoutes);

export default router;
