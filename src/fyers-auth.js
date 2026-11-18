import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFile } from "node:fs/promises";

const loginPage = await readFile(new URL("../public/fyers-login.html", import.meta.url), "utf8");
const stateCookieName = "fyers_oauth_state";
const stateCookieMaxAgeSeconds = 300;
const sessionCookieName = "fyers_session";
const sessionCookieMaxAgeSeconds = 12 * 60 * 60;
const fyersApiBaseUrl = "https://api-t1.fyers.in/api/v3";

export function registerFyersAuthRoutes(app) {
  app.get("/fyers-login", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(loginPage);
  });

  app.get("/api/fyers/session", async (request, reply) => {
    const config = getFyersConfig();
    return reply.send({
      configured: Boolean(config),
      authenticated: Boolean(config && getFyersSessionToken(request, config)),
    });
  });

  app.post("/api/fyers/logout", async (_request, reply) => {
    const config = getFyersConfig();
    reply.header("Set-Cookie", clearFyersSessionCookie(config?.redirectUri));
    return reply.send({ authenticated: false });
  });

  app.get("/auth/fyers/login", async (_request, reply) => {
    const config = getFyersConfig();
    if (!config) {
      return reply.code(503).send({
        error: "Set FYERS_APP_ID, FYERS_APP_SECRET, and FYERS_REDIRECT_URI to enable Fyers login",
      });
    }

    const state = randomBytes(32).toString("hex");
    const authorizationUrl = new URL(`${fyersApiBaseUrl}/generate-authcode`);
    authorizationUrl.searchParams.set("client_id", config.appId);
    authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", state);

    const secureCookie = new URL(config.redirectUri).protocol === "https:" ? "; Secure" : "";
    reply.header(
      "Set-Cookie",
      `${stateCookieName}=${state}; Path=/auth/fyers/callback; HttpOnly; SameSite=Lax; Max-Age=${stateCookieMaxAgeSeconds}${secureCookie}`,
    );
    return reply.redirect(authorizationUrl.toString());
  });

  app.get("/auth/fyers/callback", async (request, reply) => {
    const config = getFyersConfig();
    if (!config) {
      return reply.code(503).send({ error: "Fyers OAuth is not configured" });
    }

    const state = queryString(request.query.state);
    const cookieState = readCookie(request.headers.cookie, stateCookieName);
    if (!state || !cookieState || !constantTimeEqual(cookieState, state)) {
      return reply.code(400).send({ error: "Fyers login state is invalid or expired" });
    }

    if (queryString(request.query.error)) {
      reply.header("Set-Cookie", clearStateCookie(config.redirectUri));
      return reply.redirect("/fyers-login?status=denied");
    }

    const authCode = queryString(request.query.auth_code);
    if (!authCode) {
      reply.header("Set-Cookie", clearStateCookie(config.redirectUri));
      return reply.code(400).send({ error: "Fyers did not return an authorization code" });
    }

    try {
      const result = await exchangeFyersAuthCode({
        appId: config.appId,
        appSecret: config.appSecret,
        authCode,
      });
      if (result?.s !== "ok" || typeof result.access_token !== "string" || !result.access_token) {
        console.error("[fyers-auth] Fyers rejected the authorization-code exchange");
        reply.header("Set-Cookie", clearStateCookie(config.redirectUri));
        return reply.redirect("/fyers-login?status=failed");
      }
      reply.header("Set-Cookie", [
        clearStateCookie(config.redirectUri),
        createFyersSessionCookie(result.access_token, config),
      ]);
      return reply.redirect("/fyers-login?status=connected");
    } catch (error) {
      console.error(
        "[fyers-auth] Token exchange failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      reply.header("Set-Cookie", clearStateCookie(config.redirectUri));
      return reply.redirect("/fyers-login?status=failed");
    }
  });
}

export function getFyersConfig() {
  const appId = process.env.FYERS_APP_ID?.trim();
  const appSecret = process.env.FYERS_APP_SECRET?.trim();
  const redirectUri = process.env.FYERS_REDIRECT_URI?.trim();
  if (!appId || !appSecret || !redirectUri) return undefined;

  let parsedRedirectUri;
  try {
    parsedRedirectUri = new URL(redirectUri);
  } catch {
    return undefined;
  }
  const isLocalHttp = ["localhost", "127.0.0.1", "[::1]"].includes(parsedRedirectUri.hostname);
  if (
    (parsedRedirectUri.protocol !== "https:" &&
      !(parsedRedirectUri.protocol === "http:" && isLocalHttp)) ||
    parsedRedirectUri.username ||
    parsedRedirectUri.password ||
    parsedRedirectUri.pathname !== "/auth/fyers/callback" ||
    parsedRedirectUri.search ||
    parsedRedirectUri.hash
  ) {
    return undefined;
  }
  return { appId, appSecret, redirectUri: parsedRedirectUri.toString() };
}

export function getFyersSessionToken(request, config = getFyersConfig()) {
  if (!config) return undefined;
  const cookie = readCookie(request.headers.cookie, sessionCookieName);
  if (!cookie) return undefined;
  try {
    const [ivValue, tagValue, encryptedValue, ...extra] = cookie.split(".");
    if (
      extra.length ||
      !ivValue ||
      !tagValue ||
      !encryptedValue ||
      !/^[\da-zA-Z_-]+$/.test(ivValue) ||
      !/^[\da-zA-Z_-]+$/.test(tagValue) ||
      !/^[\da-zA-Z_-]+$/.test(encryptedValue)
    ) {
      return undefined;
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      createFyersSessionKey(config),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const token = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return token || undefined;
  } catch {
    return undefined;
  }
}

export function clearFyersSessionCookie(redirectUri) {
  const secureCookie = redirectUri && new URL(redirectUri).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie}`;
}

function createFyersSessionCookie(token, config) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createFyersSessionKey(config), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const value = [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
  const secureCookie = new URL(config.redirectUri).protocol === "https:" ? "; Secure" : "";
  return `${sessionCookieName}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieMaxAgeSeconds}${secureCookie}`;
}

function createFyersSessionKey(config) {
  return createHash("sha256")
    .update("broker-orders:fyers-session:v1\0")
    .update(config.appId)
    .update("\0")
    .update(config.appSecret)
    .digest();
}

async function exchangeFyersAuthCode({ appId, appSecret, authCode }) {
  const appIdHash = createHash("sha256")
    .update(`${appId}:${appSecret}`)
    .digest("hex");
  const response = await fetch(`${fyersApiBaseUrl}/validate-authcode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: authCode,
      appIdHash,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Fyers authorization-code exchange failed with HTTP ${response.status}`);
  }
  return result;
}

function queryString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator >= 0 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function constantTimeEqual(actual, expected) {
  if (!/^[\da-f]{64}$/i.test(actual) || !/^[\da-f]{64}$/i.test(expected)) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function clearStateCookie(redirectUri) {
  const secureCookie = new URL(redirectUri).protocol === "https:" ? "; Secure" : "";
  return `${stateCookieName}=; Path=/auth/fyers/callback; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie}`;
}
