import { Router } from "express";
import { getLiquiditySwings } from "../controllers/liquidity-swings.controller.js";
import { validateLiquiditySwingsQuery } from "../middleware/validate-liquidity-swings.js";

const router = Router();

router.get("/", validateLiquiditySwingsQuery, getLiquiditySwings);

export default router;
