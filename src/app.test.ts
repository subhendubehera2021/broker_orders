import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import type { AuthenticatedSession } from "./kotak-neo-client.js";

const config: AppConfig = {
  host: "127.0.0.1",
  port: 3000,
  kotakNeo: {
    apiBaseUrl: "https://kotak.example/",
    consumerKey: "test-consumer-key",
    financialKey: "test-financial-key",
    totpLoginPath: "test/login",
    totpValidatePath: "test/validate",
    requestTimeoutMs: 1000,
  },
};

const authenticatedSession: AuthenticatedSession = {
  sid: "private-sid",
  tradeToken: "private-trade-token",
};

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("authentication routes", () => {
  it("completes login without returning broker tokens", async () => {
    let loginCount = 0;
    const app = buildApp({
      config,
      authClient: {
        async login() {
          loginCount += 1;
          return authenticatedSession;
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        mobileNumber: "+919999996708",
        ucc: "TESTUCC",
        totp: "123456",
        mpin: "123456",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { authenticated: true });
    assert.equal(loginCount, 1);
    assert.equal(response.body.includes("private-trade-token"), false);

    const sessionResponse = await app.inject("/api/auth/session");
    assert.deepEqual(sessionResponse.json(), {
      authenticated: true,
    });
    assert.equal(sessionResponse.body.includes("private-sid"), false);
  });

  it("rejects malformed credentials before calling the broker", async () => {
    const app = buildApp({
      config,
      authClient: {
        async login() {
          assert.fail("login should not be called for invalid credentials");
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        mobileNumber: "+919999996708",
        ucc: "TESTUCC",
        totp: "not-a-totp",
        mpin: "123456",
      },
    });

    assert.equal(response.statusCode, 400);
  });

  it("clears session state on logout", async () => {
    const app = buildApp({
      config,
      authClient: { async login() { return authenticatedSession; } },
    });
    apps.push(app);

    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        mobileNumber: "+919999996708",
        ucc: "TESTUCC",
        totp: "123456",
        mpin: "123456",
      },
    });
    const logoutResponse = await app.inject({ method: "POST", url: "/api/auth/logout" });

    assert.deepEqual(logoutResponse.json(), { authenticated: false });
    assert.deepEqual((await app.inject("/api/auth/session")).json(), {
      authenticated: false,
    });
  });

  it("reports missing broker configuration without attempting login", async () => {
    const app = buildApp({
      config: {
        ...config,
        kotakNeo: { ...config.kotakNeo, consumerKey: undefined },
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        mobileNumber: "+919999996708",
        ucc: "TESTUCC",
        totp: "123456",
        mpin: "123456",
      },
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: "Kotak Neo consumer key is not configured",
    });
  });
});
