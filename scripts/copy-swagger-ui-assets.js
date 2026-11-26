import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const swaggerUiDirectory = dirname(require.resolve("swagger-ui-dist/package.json"));
const publicDocsDirectory = fileURLToPath(new URL("../public/docs/", import.meta.url));
const assets = [
  "swagger-ui.css",
  "swagger-ui-bundle.js",
  "swagger-ui-standalone-preset.js",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "LICENSE",
  "NOTICE",
];

mkdirSync(publicDocsDirectory, { recursive: true });

for (const asset of assets) {
  copyFileSync(join(swaggerUiDirectory, asset), join(publicDocsDirectory, asset));
}
