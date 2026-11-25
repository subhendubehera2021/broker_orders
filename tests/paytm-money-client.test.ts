import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PaytmMoneyClient, PaytmMoneyError } from "../src/paytm-money/index.js";

const clientOptions = {
  apiKey: "test-api-key",
  apiSecretKey: "test-api-secret",
  requestTimeoutMs: 1000,
};

describe("PaytmMoneyClient", () => {
  it("creates the documented login URL with API key and caller state", () => {
    const client = new PaytmMoneyClient(clientOptions);
    const loginUrl = client.createLoginUrl("csrf-state&value");

    assert.equal(loginUrl.origin, "https://login.paytmmoney.com");
    assert.equal(loginUrl.pathname, "/merchant-login");
    assert.equal(loginUrl.searchParams.get("apiKey"), "test-api-key");
    assert.equal(loginUrl.searchParams.get("state"), "csrf-state&value");
  });

  it("exchanges the request token for all documented token types", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const tokens = {
      merchant_id: "148",
      channel_id: "API-148",
      api_key: "test-api-key",
      access_token: "access-token",
      public_access_token: "public-token",
      read_access_token: "read-token",
    };
    const client = new PaytmMoneyClient(clientOptions, async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedInit = init;
      return Response.json(tokens);
    });

    assert.deepEqual(await client.generateAccessToken("request-token"), tokens);
    assert.equal(capturedUrl?.href, "https://developer.paytmmoney.com/accounts/v2/gettoken");
    assert.equal(capturedInit?.method, "POST");
    assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      api_key: "test-api-key",
      api_secret_key: "test-api-secret",
      request_token: "request-token",
    });
  });

  it("retrieves user details with the x-jwt-token header", async () => {
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    const details = {
      data: {
        kycName: "Example User",
        userId: 123,
        activeSegments: ["CASH", "FO"],
      },
      meta: {
        requestId: null,
        responseId: "response-id",
        code: "PM_ONB_SC_200",
        message: "Success",
        displayMessage: "PM_ONB_SC_200",
      },
    };
    const client = new PaytmMoneyClient(clientOptions, async (input, init) => {
      capturedUrl = new URL(input.toString());
      capturedInit = init;
      return Response.json(details);
    });

    assert.deepEqual(await client.getUserDetails("read-token"), details);
    assert.equal(capturedUrl?.href, "https://developer.paytmmoney.com/accounts/v1/user/details");
    assert.equal(capturedInit?.method, "GET");
    assert.equal(new Headers(capturedInit?.headers).get("x-jwt-token"), "read-token");
  });

  it("surfaces documented access-token failures without returning a token-shaped result", async () => {
    const client = new PaytmMoneyClient(clientOptions, async () =>
      Response.json({
        resultStatus: "FAILURE",
        resultCode: "PM_MERCHANT_AUTH_400607",
        resultMsg: "Invalid Api Key or Api Secret Key or Request Token",
      }),
    );

    await assert.rejects(
      client.generateAccessToken("invalid-request-token"),
      (error: unknown) =>
        error instanceof PaytmMoneyError &&
        error.statusCode === 400 &&
        error.upstreamCode === "PM_MERCHANT_AUTH_400607",
    );
  });
});
