import { readFile } from "node:fs/promises";

const [page, clientScript, styles, swingLogic, timeFormat, demoTrading, chartLibrary, chartLicense] = await Promise.all([
  readFile(new URL("../trading-view/index.html", import.meta.url), "utf8"),
  readFile(new URL("../trading-view/chart.js", import.meta.url), "utf8"),
  readFile(new URL("../trading-view/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../trading-view/liquidity-swings.js", import.meta.url), "utf8"),
  readFile(new URL("../trading-view/time-format.js", import.meta.url), "utf8"),
  readFile(new URL("../trading-view/demo-trading.js", import.meta.url), "utf8"),
  readFile(
    new URL("../node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../node_modules/lightweight-charts/LICENSE", import.meta.url), "utf8"),
]);

export function registerTradingViewRoutes(app) {
  app.get("/trading-view", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(page);
  });
  app.get("/trading-view/chart.js", async (_request, reply) => {
    return reply.type("application/javascript; charset=utf-8").send(clientScript);
  });
  app.get("/trading-view/liquidity-swings.js", async (_request, reply) => {
    return reply.type("application/javascript; charset=utf-8").send(swingLogic);
  });
  app.get("/trading-view/time-format.js", async (_request, reply) => {
    return reply.type("application/javascript; charset=utf-8").send(timeFormat);
  });
  app.get("/trading-view/demo-trading.js", async (_request, reply) => {
    return reply.type("application/javascript; charset=utf-8").send(demoTrading);
  });
  app.get("/trading-view/styles.css", async (_request, reply) => {
    return reply.type("text/css; charset=utf-8").send(styles);
  });
  app.get("/trading-view/lightweight-charts.js", async (_request, reply) => {
    return reply.type("application/javascript; charset=utf-8").send(chartLibrary);
  });
  app.get("/trading-view/lightweight-charts-license", async (_request, reply) => {
    return reply.type("text/plain; charset=utf-8").send(chartLicense);
  });
}
