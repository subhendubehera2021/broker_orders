import { createClient } from "@libsql/client";

let client;

function getEnvironmentValue(primaryName, fallbackName) {
  return process.env[primaryName]?.trim() || process.env[fallbackName]?.trim();
}

function normalizeDatabaseUrl(url) {
  return url.startsWith("turso://") ? `libsql://${url.slice("turso://".length)}` : url;
}

export function getTursoClient() {
  if (client) {
    return client;
  }

  const url = getEnvironmentValue("TURSO_DATABASE_URL_v2", "TURSO_DATABASE_URL");
  const authToken = getEnvironmentValue("TURSO_AUTH_TOKEN_v2", "TURSO_AUTH_TOKEN");
  if (!url || !authToken) {
    const error = new Error(
      "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (or their _v2 variants) in .env to enable persistence.",
    );
    error.statusCode = 503;
    throw error;
  }

  client = createClient({
    url: normalizeDatabaseUrl(url),
    authToken,
  });
  return client;
}
