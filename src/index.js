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
    const settings = await env.AUTO_TRADE_SETTINGS.get("auto-trade-settings");
    console.log(`[nifty-cron] auto-trade-settings found=${settings !== null}`);
  },
};
