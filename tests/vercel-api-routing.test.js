import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import apiHandler from "../api/[...path].js";

test("Vercel API catch-all forwards API paths to Express", async (t) => {
  const server = createServer(apiHandler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  for (const path of ["/api/health", "/health"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  }
});
