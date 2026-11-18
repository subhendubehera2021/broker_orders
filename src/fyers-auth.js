import { randomBytes, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { fyersModel } = require("fyers-api-v3");
const loginPage = await readFile(new URL("../public/fyers-login.html", import.meta.url), "utf8");
const stateCookieName = "fyers_oauth_state";
const stateCookieMaxAgeSeconds = 300;

export function registerFyersAuthRoutes(app, { createFyersModel = createDefaultFyersModel } = {}) {
  let accessToken;

  app.get("/fyers-login", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(loginPage);
  });

  app.get("/api/fyers/session", async (_request, reply) => {
    return reply.send({
      configured: Boolean(readFyersConfig()),
      authenticated: Boolean(accessToken),
    });
  });

  app.post("/api/fyers/logout", async (_request, reply) => {
    accessToken = undefined;
    return reply.send({ authenticated: false });
  });

  app.get("/auth/fyers/login", async (_request, reply) => {
    const config = readFyersConfig();
    if (!config) {
      return reply.code(503).send({
        error: "Set FYERS_APP_ID, FYERS_APP_SECRET, and FYERS_REDIRECT_URI to enable Fyers login",
      });
    }

    const state = randomBytes(32).toString("hex");
    const model = createConfiguredModel(createFyersModel, config);
    const authorizationUrl = new URL(model.generateAuthCode({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      state,
    }));
    if (
      authorizationUrl.protocol !== "https:" ||
      !(authorizationUrl.hostname === "fyers.in" || authorizationUrl.hostname.endsWith(".fyers.in"))
    ) {
      return reply.code(502).send({ error: "Fyers returned an invalid authorization URL" });
    }
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
    const config = readFyersConfig();
    if (!config) {
      return reply.code(503).send({ error: "Fyers OAuth is not configured" });
    }

    const state = queryString(request.query.state);
    const cookieState = readCookie(request.headers.cookie, stateCookieName);
    if (!state || !cookieState || !constantTimeEqual(cookieState, state)) {
      return reply.code(400).send({ error: "Fyers login state is invalid or expired" });
    }

    clearStateCookie(reply, config.redirectUri);
    if (queryString(request.query.error)) {
      return reply.redirect("/fyers-login?status=denied");
    }

    const authCode = queryString(request.query.auth_code);
    if (!authCode) {
      return reply.code(400).send({ error: "Fyers did not return an authorization code" });
    }

    try {
      const model = createConfiguredModel(createFyersModel, config);
      const result = await model.generate_access_token({
        client_id: config.appId,
        secret_key: config.appSecret,
        auth_code: authCode,
      });
      if (result?.s !== "ok" || typeof result.access_token !== "string" || !result.access_token) {
        console.error("[fyers-auth] Fyers rejected the authorization-code exchange");
        return reply.redirect("/fyers-login?status=failed");
      }
      accessToken = result.access_token;
      return reply.redirect("/fyers-login?status=connected");
    } catch (error) {
      console.error(
        "[fyers-auth] Token exchange failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return reply.redirect("/fyers-login?status=failed");
    }
  });
}

function createDefaultFyersModel() {
  return new fyersModel({ enableLogging: false });
}

function createConfiguredModel(createFyersModel, config) {
  const model = createFyersModel();
  model.setAppId(config.appId);
  model.setRedirectUrl(config.redirectUri);
  return model;
}

function readFyersConfig() {
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

function clearStateCookie(reply, redirectUri) {
  const secureCookie = new URL(redirectUri).protocol === "https:" ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${stateCookieName}=; Path=/auth/fyers/callback; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie}`,
  );
}
