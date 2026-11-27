import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import WebSocket from "ws";
import liveChartServer from "../api/live-chart.js";

test("Vercel live-chart function accepts WebSocket upgrades", async (t) => {
  await new Promise((resolve, reject) => {
    liveChartServer.once("error", reject);
    liveChartServer.listen(0, "127.0.0.1", resolve);
  });

  const { port } = liveChartServer.address();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/live-chart`);
  t.after(async () => {
    await new Promise((resolve) => {
      if (socket.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      socket.once("close", resolve);
      socket.close();
    });
    await new Promise((resolve, reject) => {
      liveChartServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  await once(socket, "open");
  socket.send("{}");
  const [message] = await once(socket, "message");

  assert.deepEqual(JSON.parse(message.toString()), {
    type: "error",
    message: "Provide a valid symbol and a 1m, 3m, 5m, or 15m interval.",
  });
});
