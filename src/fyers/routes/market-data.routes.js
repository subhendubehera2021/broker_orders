import { Router } from "express";
import {
  getExpiredContracts,
  getExpiredExpiryDates,
  getExpiredFoData,
} from "../controllers/expired-fo-data.controller.js";
import { getHistoricalData } from "../controllers/market-data.controller.js";
import { getOptionChain } from "../controllers/option-chain.controller.js";
import { getQuotes } from "../controllers/quotes.controller.js";
import {
  validateExpiredContractsQuery,
  validateExpiredExpiryDatesQuery,
  validateExpiredFoDataQuery,
} from "../middleware/validate-expired-fo-data.js";
import { validateHistoricalDataQuery } from "../middleware/validate-historical-data.js";
import { validateOptionChainQuery } from "../middleware/validate-option-chain.js";
import { validateQuotesQuery } from "../middleware/validate-quotes.js";

const router = Router();

router.get("/expired-fo-data", validateExpiredFoDataQuery, getExpiredFoData);
router.get(
  "/expired-fo-data/contracts",
  validateExpiredContractsQuery,
  getExpiredContracts,
);
router.get(
  "/expired-fo-data/expiry-dates",
  validateExpiredExpiryDatesQuery,
  getExpiredExpiryDates,
);
router.get("/historical-data", validateHistoricalDataQuery, getHistoricalData);
router.get("/option-chain", validateOptionChainQuery, getOptionChain);
router.get("/quotes", validateQuotesQuery, getQuotes);

export default router;
