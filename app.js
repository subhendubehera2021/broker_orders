import Fastify from "fastify";
import { registerSwingApiRoutes } from "./src/swing-api-app.js";

const port = Number(process.env.PORT) || 3000;
const app = Fastify({ bodyLimit: 1_024 });

registerSwingApiRoutes(app);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
