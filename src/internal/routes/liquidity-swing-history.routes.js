import { Router } from "express";
import {
  getSavedLiquiditySwingHistory,
  updateSavedLiquiditySwingAnalysis,
  updateSavedLiquiditySwingHistory,
} from "../controllers/liquidity-swing-history.controller.js";
import { requireMasterApiKey } from "../middleware/require-master-api-key.js";
import {
  validateLiquiditySwingAnalysisUpdate,
  validateLiquiditySwingHistoryQuery,
  validateLiquiditySwingHistoryUpdate,
} from "../middleware/validate-liquidity-swing-history.js";

const router = Router();

router.get("/", validateLiquiditySwingHistoryQuery, getSavedLiquiditySwingHistory);
router.patch(
  "/:id/analysis",
  requireMasterApiKey,
  validateLiquiditySwingAnalysisUpdate,
  updateSavedLiquiditySwingAnalysis,
);
router.patch(
  "/:id",
  requireMasterApiKey,
  validateLiquiditySwingHistoryUpdate,
  updateSavedLiquiditySwingHistory,
);

export default router;
