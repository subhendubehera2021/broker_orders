import { createServer } from "node:http";
import app from "./app.js";
import { attachLiveChartWebSocket } from "./fyers/services/live-chart-websocket.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer(app);
attachLiveChartWebSocket(server);

server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
