export default {
  scheduled(controller) {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    console.log(`[nifty-cron] cron=${controller.cron} scheduledAt=${scheduledAt}`);
  },
};
