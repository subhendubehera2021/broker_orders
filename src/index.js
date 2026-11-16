import { fetchHighestVolumeNiftyOptions } from "./nifty-option-chain.js";
import { fetchLiquiditySwingsFromApi } from "./liquidity-swing/api-client.js";

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function formatIST(timestamp) {
  return `${istDateTime.format(new Date(timestamp))} IST`;
}

function formatSwingTable(analyses) {
  const headers = [
    "SIDE",
    "SYMBOL",
    "TOKEN",
    "OPTION VOL",
    "INTERVAL",
    "LOOKBACK",
    "SWING HIGH",
    "ZONE BOTTOM..TOP",
    "PIVOT TIME (IST)",
    "CONFIRMED AT (IST)",
    "TOUCHES",
    "TOUCH VOL",
    "STATUS",
  ];
  const rows = analyses.map(({ optionSide, instrument, swing, interval, pivotLookback }) => [
    optionSide,
    instrument.symbol,
    instrument.token,
    numberFormat.format(instrument.volume),
    interval,
    String(pivotLookback),
    swing ? numberFormat.format(swing.level) : "-",
    swing
      ? `${numberFormat.format(swing.zoneBottom)}..${numberFormat.format(swing.zoneTop)}`
      : "-",
    swing ? formatIST(Date.parse(swing.pivotTime)) : "-",
    swing ? formatIST(Date.parse(swing.confirmedAt)) : "-",
    swing ? String(swing.intersectionCount) : "0",
    swing ? numberFormat.format(swing.intersectionVolume) : "0",
    swing?.status ?? "not-found",
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const separator = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const formatRow = (cells) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

  return [
    separator,
    formatRow(headers),
    separator,
    ...rows.map(formatRow),
    separator,
  ].join("\n");
}

export default {
  async scheduled(controller, env) {
    const scheduledMinute = Math.floor(controller.scheduledTime / 60_000) * 60_000;
    console.log(
      `[nifty-cron] cron=${controller.cron}` +
        ` scheduledForIST=${formatIST(scheduledMinute)}` +
        ` startedAtIST=${formatIST(Date.now())}`,
    );
    const {
      KOTAK_NEO_API_TOKEN: apiToken,
      KOTAK_NEO_BASE_URL: baseUrl,
      SWING_API_URL: swingApiUrl,
      SWING_API_SECRET: swingApiSecret,
    } = env;
    const instruments = await fetchHighestVolumeNiftyOptions({ apiToken, baseUrl });
    const analyses = await fetchLiquiditySwingsFromApi(
      [
        { optionSide: "CALL", instrument: instruments.call, token: instruments.call.token },
        { optionSide: "PUT", instrument: instruments.put, token: instruments.put.token },
      ],
      { apiUrl: swingApiUrl, apiSecret: swingApiSecret },
    );
    console.log(`[nifty-cron] liquidity-swings\n${formatSwingTable(analyses)}`);
  },
};
