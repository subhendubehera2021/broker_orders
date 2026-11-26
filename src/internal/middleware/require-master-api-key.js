import { timingSafeEqual } from "node:crypto";

export function requireMasterApiKey(request, response, next) {
  const expectedKey = process.env.MASTER_API_KEY?.trim()
    || process.env.MASTER_PASSCODE?.trim();
  if (!expectedKey) {
    response.status(503).json({
      error: "Neither MASTER_API_KEY nor MASTER_PASSCODE is configured.",
    });
    return;
  }

  const providedKey = request.get("x-apikey");
  if (typeof providedKey !== "string") {
    response.status(401).json({ error: "A valid x-apikey header is required." });
    return;
  }

  const expected = Buffer.from(expectedKey);
  const provided = Buffer.from(providedKey);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    response.status(401).json({ error: "A valid x-apikey header is required." });
    return;
  }

  next();
}
