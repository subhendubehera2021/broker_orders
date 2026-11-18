const axisFormats = {
  year: { year: "numeric" },
  month: { month: "short" },
  day: { day: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit", hour12: false },
  timeWithSeconds: { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false },
};

export function formatIndiaTime(value, includeDate = false) {
  if (typeof value !== "number") return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(includeDate ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value * 1000));
}

export function formatIndiaAxisTick(time, kind) {
  const isTimestamp = typeof time === "number";
  const date = isTimestamp
    ? new Date(time * 1000)
    : new Date(Date.UTC(time.year, time.month - 1, time.day, 12));
  const formatKind = isTimestamp || kind === "year" || kind === "month" ? kind : "day";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(axisFormats[formatKind] ?? axisFormats.time),
  }).format(date);
}
