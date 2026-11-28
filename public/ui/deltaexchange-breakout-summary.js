const DEFAULT_LOOKBACK_SECONDS = 3 * 24 * 60 * 60;

export function getBreakoutMoveAnalysis(
  events,
  {
    startTime,
    endTime = Math.floor(Date.now() / 1000),
  } = {},
) {
  if (!Array.isArray(events)) {
    throw new TypeError("Breakout events must be an array");
  }
  if (startTime === undefined) {
    startTime = endTime - DEFAULT_LOOKBACK_SECONDS;
  }
  if (
    !Number.isSafeInteger(startTime) ||
    !Number.isSafeInteger(endTime) ||
    startTime >= endTime
  ) {
    throw new RangeError("Breakout analysis range must have valid start and end times");
  }
  const analysis = [];

  for (const event of events) {
    if (
      !event ||
      !["high", "low"].includes(event.side) ||
      !Number.isSafeInteger(event.breakoutTime) ||
      ![
        event.level,
        event.breakoutExtreme,
        event.stopLoss,
        event.maxFavorablePoints,
      ].every(Number.isFinite) ||
      event.level === 0
    ) {
      throw new Error("Breakout event data is invalid.");
    }

    if (event.breakoutTime < startTime || event.breakoutTime >= endTime) {
      continue;
    }

    const breakoutMove = event.side === "high"
      ? event.breakoutExtreme - event.level
      : event.level - event.breakoutExtreme;
    const favorablePoints = Math.max(0, event.maxFavorablePoints, breakoutMove);
    analysis.push({
      ...event,
      favorablePercent: (favorablePoints / Math.abs(event.level)) * 100,
      stopRiskPercent: (Math.abs(event.level - event.stopLoss) / Math.abs(event.level)) * 100,
    });
  }

  return analysis.sort((left, right) => left.breakoutTime - right.breakoutTime);
}
