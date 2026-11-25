import { Router } from "express";
import { getHighestVolumeOptions } from "../controllers/highest-volume-options.controller.js";
import { validateLtpRange } from "../middleware/validate-ltp-range.js";
import { validateOptionChainQuery } from "../../fyers/middleware/validate-option-chain.js";

const router = Router();

router.get(
  "/highest-volume",
  validateOptionChainQuery,
  validateLtpRange,
  getHighestVolumeOptions,
);

export default router;
