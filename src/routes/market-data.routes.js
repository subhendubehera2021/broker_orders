import { Router } from "express";
import { getHistoricalData } from "../controllers/market-data.controller.js";
import { validateHistoricalDataQuery } from "../middleware/validate-historical-data.js";
import { getOptionChain } from "../controllers/option-chain.controller.js";
import { validateOptionChainQuery } from "../middleware/validate-option-chain.js";
import { getQuotes } from "../controllers/quotes.controller.js";
import { validateQuotesQuery } from "../middleware/validate-quotes.js";

const router = Router();

router.get("/historical-data", validateHistoricalDataQuery, getHistoricalData);
router.get("/option-chain", validateOptionChainQuery, getOptionChain);
router.get("/quotes", validateQuotesQuery, getQuotes);

export default router;
