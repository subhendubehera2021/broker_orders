import { createServer } from "node:http";
import { attachLiveChartWebSocket } from "../src/fyers/services/live-chart-websocket.js";

const server = createServer();
attachLiveChartWebSocket(server);

export default server;
