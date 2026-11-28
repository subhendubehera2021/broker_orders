import { Router } from "express";
import { getCandles } from "../controllers/market-data.controller.js";

const router = Router();

router.get("/candles", getCandles);

export default router;
