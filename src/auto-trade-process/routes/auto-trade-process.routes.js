import { Router } from "express";
import { getAutoTradeProcess } from "../controllers/auto-trade-process.controller.js";
import { validateLtpRange } from "../../internal/middleware/validate-ltp-range.js";
import { validateOptionChainQuery } from "../../fyers/middleware/validate-option-chain.js";

const router = Router();

router.get(
  "/",
  validateOptionChainQuery,
  validateLtpRange,
  getAutoTradeProcess,
);

export default router;
