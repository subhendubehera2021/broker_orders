function parseFiniteNumber(value) {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFyersLiveTick(message) {
  let payload = message;
  if (Buffer.isBuffer(payload)) {
    payload = payload.toString("utf8");
  }
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  const tick = payload?.data && typeof payload.data === "object"
    ? payload.data
    : payload;
  if (!tick || typeof tick !== "object" || Array.isArray(tick)) {
    return null;
  }

  const symbol = tick.symbol ?? tick.sym;
  const price = parseFiniteNumber(tick.ltp ?? tick.lp);
  const rawTime = parseFiniteNumber(
    tick.exch_feed_time ?? tick.last_traded_time ?? tick.feed_time ?? tick.timestamp,
  );
  const rawVolume = parseFiniteNumber(tick.vol_traded_today ?? tick.vtt);
  if (typeof symbol !== "string" || price === null || rawTime === null) {
    return null;
  }

  return {
    symbol,
    price,
    time: Math.floor(rawTime > 1e12 ? rawTime / 1000 : rawTime),
    cumulativeVolume: rawVolume !== null && rawVolume >= 0 ? rawVolume : null,
  };
}
