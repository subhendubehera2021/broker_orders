import { Router } from "express";
import { getAuthStatus, testAuth } from "../controllers/auth.controller.js";

const router = Router();

router.get("/status", getAuthStatus);
router.post("/test", testAuth);

export default router;
