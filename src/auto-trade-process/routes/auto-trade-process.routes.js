import { Router } from "express";
import { getAutoTradeProcess } from "../controllers/auto-trade-process.controller.js";
import { validateLtpRange } from "../../internal/middleware/validate-ltp-range.js";
import { validateOptionChainQuery } from "../../fyers/middleware/validate-option-chain.js";
import { validateLiquiditySwingOptions } from "../middleware/validate-liquidity-swing-options.js";
import { validateAutoTradeProcessBody } from "../middleware/validate-auto-trade-process-body.js";

const router = Router();

router.get(
  "/",
  validateOptionChainQuery,
  validateLtpRange,
  validateLiquiditySwingOptions,
  getAutoTradeProcess,
);
router.post("/", validateAutoTradeProcessBody, getAutoTradeProcess);

export default router;
