import { networkInterfaces } from "node:os";
import Fastify from "fastify";
import { registerSwingApiRoutes } from "./src/swing-api-app.js";

const port = Number(process.env.PORT) || 3000;
const app = Fastify({ bodyLimit: 1_024 });

registerSwingApiRoutes(app);

app.listen({ port, host: "0.0.0.0" }).then(() => {
  const serverAddress = app.server.address();
  const listeningPort =
    typeof serverAddress === "object" && serverAddress ? serverAddress.port : port;
  const addresses = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((address) => !address.internal && (address.family === "IPv4" || address.family === 4))
    .map((address) => address.address);

  console.log("App is running:");
  console.log(`  Local:   http://localhost:${listeningPort}`);
  for (const address of new Set(addresses)) {
    console.log(`  Network: http://${address}:${listeningPort}`);
  }
  console.log(`  Fyers:   http://localhost:${listeningPort}/fyers-login`);
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
