import express from "express";

const port = Number(process.env.PORT ?? 3000);
const cronIntervalMs = 60_000;
const app = express();

export function runCron(): void {
  console.log(`[cron] ${new Date().toISOString()}`);
}

export function startCron(): NodeJS.Timeout {
  return setInterval(runCron, cronIntervalMs);
}

app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[server] listening on http://0.0.0.0:${port}`);
  startCron();
});
