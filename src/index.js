import { fetchHighestVolumeNiftyOptions } from "./nifty-option-chain.js";
import {
  fetchLiquiditySwings,
  recentIndiaDateRange,
} from "./liquidity-swing/index.js";

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

function formatIST(timestamp) {
  return `${istDateTime.format(new Date(timestamp))} IST`;
}

export default {
  async scheduled(controller, env) {
    const scheduledMinute = Math.floor(controller.scheduledTime / 60_000) * 60_000;
    console.log(
      `[nifty-cron] cron=${controller.cron}` +
        ` scheduledForIST=${formatIST(scheduledMinute)}` +
        ` startedAtIST=${formatIST(Date.now())}`,
    );
    const [apiToken, baseUrl] = await Promise.all([
      env.AUTO_TRADE_SETTINGS.get("kotak-neo-api-token"),
      env.AUTO_TRADE_SETTINGS.get("kotak-neo-base-url"),
    ]);
    const instruments = await fetchHighestVolumeNiftyOptions({ apiToken, baseUrl });
    const dateRange = recentIndiaDateRange();
    for (const [optionSide, instrument] of [
      ["CALL", instruments.call],
      ["PUT", instruments.put],
    ]) {
      console.log(
        `[nifty-cron] highest-volume-${optionSide.toLowerCase()}` +
          ` symbol=${instrument.symbol} token=${instrument.token} volume=${instrument.volume}`,
      );
    }

    const analyses = await Promise.all(
      [
        ["CALL", instruments.call],
        ["PUT", instruments.put],
      ].map(async ([optionSide, instrument]) => ({
        optionSide,
        instrument,
        ...await fetchLiquiditySwings(
          instrument,
          { apiToken, baseUrl, ...dateRange },
        ),
      })),
    );
    for (const { optionSide, instrument, bars, swings, interval, pivotLookback } of analyses) {
      for (const swingSide of ["high", "low"]) {
        const swing = swings[swingSide];
        if (!swing) {
          console.log(
            `[nifty-cron] liquidity-swing optionSide=${optionSide}` +
              ` symbol=${instrument.symbol} swingSide=${swingSide.toUpperCase()}` +
              ` status=not-found candles=${bars.length}`,
          );
          continue;
        }
        console.log(
          `[nifty-cron] liquidity-swing optionSide=${optionSide}` +
            ` symbol=${instrument.symbol} swingSide=${swingSide.toUpperCase()}` +
            ` interval=${interval} pivotLookback=${pivotLookback}` +
            ` pivotTime=${swing.pivotTime} confirmedAt=${swing.confirmedAt}` +
            ` level=${swing.level} zoneBottom=${swing.zoneBottom}` +
            ` zoneTop=${swing.zoneTop} intersections=${swing.intersectionCount}` +
            ` intersectionVolume=${swing.intersectionVolume} status=${swing.status}` +
            (swing.brokenAt ? ` brokenAt=${swing.brokenAt}` : ""),
        );
      }
    }
  },
};
