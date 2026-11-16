import { callLiquiditySwingApi } from "./liquidity-swing-api.js";

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
    const scheduledFor = scheduledMinute + 59_000;
    const delay = scheduledFor - Date.now();
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    console.log(
      `[nifty-cron] cron=${controller.cron}` +
        ` scheduledForIST=${formatIST(scheduledFor)}` +
        ` startedAtIST=${formatIST(Date.now())}`,
    );

    const status = await callLiquiditySwingApi(env.LIQUIDITY_SWING_API_TOKEN);
    console.log(`[nifty-cron] liquidity-swing-api status=${status}`);
  },
};
