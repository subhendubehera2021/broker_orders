import { fetchHighestVolumeNiftyOptions } from "./nifty-option-chain.js";

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
    console.log(
      `[nifty-cron] highest-volume-call symbol=${instruments.call.symbol}` +
        ` token=${instruments.call.token} volume=${instruments.call.volume}`,
    );
    console.log(
      `[nifty-cron] highest-volume-put symbol=${instruments.put.symbol}` +
        ` token=${instruments.put.token} volume=${instruments.put.volume}`,
    );
  },
};
