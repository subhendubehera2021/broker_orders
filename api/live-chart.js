import { createServer } from "node:http";
import app from "../src/app.js";
import { attachLiveChartWebSocket } from "../src/fyers/services/live-chart-websocket.js";

const server = createServer(app);
attachLiveChartWebSocket(server);

export default server;
