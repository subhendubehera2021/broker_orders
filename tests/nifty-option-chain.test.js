import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchHighestVolumeNiftyOptions,
  selectHighestVolumeCallAndPut,
} from "../src/nifty-option-chain.js";

test("selects the highest-volume call and put from Kotak's wrapped chain", () => {
  const result = selectHighestVolumeCallAndPut({
    data: {
      call: [
        {
          instrument: { neoSymbol: "nse_fo|1", symbol: "NIFTY-CE-LOW", optionType: "CE" },
          quote: { volume: 100 },
        },
        {
          instrument: { neoSymbol: "nse_fo|2", symbol: "NIFTY-CE-HIGH", optionType: "CE" },
          quote: { volume: "900" },
        },
      ],
      put: [
        {
          inst: { neoSymbol: "nse_fo|3", symbol: "NIFTY-PE-HIGH", optType: "PE" },
          quote: { vol: "1200" },
        },
      ],
    },
  });

  assert.deepEqual(result, {
    call: {
      optionType: "CE",
      symbol: "NIFTY-CE-HIGH",
      token: "nse_fo|2",
      volume: 900,
    },
    put: {
      optionType: "PE",
      symbol: "NIFTY-PE-HIGH",
      token: "nse_fo|3",
      volume: 1200,
    },
  });
});

test("requests the NIFTY option chain using only the API dashboard token", async () => {
  let requestUrl;
  let requestOptions;
  const result = await fetchHighestVolumeNiftyOptions(
    {
      apiToken: "secret-api-token",
      baseUrl: "https://cis.kotaksecurities.com/",
    },
    async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return Response.json({
        call: [{
          instrument: { neoSymbol: "nse_fo|1", symbol: "NIFTY-CE" },
          quote: { volume: 200 },
        }],
        put: [{
          instrument: { neoSymbol: "nse_fo|2", symbol: "NIFTY-PE" },
          quote: { volume: 300 },
        }],
      });
    },
  );

  assert.equal(
    requestUrl.href,
    "https://cis.kotaksecurities.com/market-data/1.0/watchlist/option-chain?exchange=nse_fo&underlying=NIFTY&instrument_type=option&count=40",
  );
  assert.equal(requestOptions.headers.Authorization, "secret-api-token");
  assert.equal("Auth" in requestOptions.headers, false);
  assert.equal(result.call.symbol, "NIFTY-CE");
  assert.equal(result.put.symbol, "NIFTY-PE");
});

test("rejects a non-Kotak base URL before sending credentials", async () => {
  let fetchCalled = false;
  await assert.rejects(
    fetchHighestVolumeNiftyOptions(
      { apiToken: "secret-api-token", baseUrl: "https://example.com" },
      async () => {
        fetchCalled = true;
      },
    ),
    /HTTPS Kotak Securities URL/,
  );
  assert.equal(fetchCalled, false);
});

test("does not follow redirects from Kotak API requests", async () => {
  let redirectMode;
  await assert.rejects(
    fetchHighestVolumeNiftyOptions(
      {
        apiToken: "secret-api-token",
        baseUrl: "https://cis.kotaksecurities.com",
      },
      async (_url, options) => {
        redirectMode = options.redirect;
        return new Response(null, {
          status: 302,
          headers: { Location: "https://example.com/collect" },
        });
      },
    ),
    /HTTP 302/,
  );
  assert.equal(redirectMode, "manual");
});
