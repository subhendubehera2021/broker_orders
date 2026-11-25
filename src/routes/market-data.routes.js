import { Router } from "express";
import { getHistoricalData } from "../controllers/market-data.controller.js";
import { validateHistoricalDataQuery } from "../middleware/validate-historical-data.js";

const router = Router();

router.get("/historical-data", validateHistoricalDataQuery, getHistoricalData);

export default router;
