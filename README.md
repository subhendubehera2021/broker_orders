# NIFTY Cron Worker

A Cloudflare Worker with a Cron Trigger that runs every minute. Each run fetches NIFTY option-chain data and selects the highest-volume call and put. It sends both instruments to the protected Vercel swing API, which fetches one-minute candles and finds the latest confirmed liquidity swing high for each; the Worker logs the results in a table. Swings use a five-candle pivot lookback. Neither service places trades. Cloudflare may start an invocation slightly after its scheduled boundary.

Wrangler requires Node.js 22.12 or newer.

## Local development

Install dependencies and run the scheduled-event simulator:

```sh
npm install
npm run dev
```

For local runs, put `KOTAK_NEO_API_TOKEN`, `KOTAK_NEO_BASE_URL`, `SWING_API_URL`, and `SWING_API_SECRET` in `.dev.vars`. This file is ignored by Git; do not commit real credentials.

In another terminal, trigger a local scheduled event:

```sh
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

The local Wrangler console displays the dummy cron log.

## Cloudflare Worker environment

The Worker uses environment secrets instead of KV. Set these four values for the Worker:

- `KOTAK_NEO_API_TOKEN`: the plain API access token from the NEO API Dashboard (not the session JWT).
- `KOTAK_NEO_BASE_URL`: the `baseUrl` returned by `tradeApiValidate`.
- `SWING_API_URL`: the deployed Vercel endpoint ending in `/api/liquidity-swing`.
- `SWING_API_SECRET`: a strong random secret shared with Vercel.

Set the deployed Worker values with `npx wrangler secret put <NAME>` for each name above. For local development, use `.dev.vars`. Do not put credentials in source files or logs. The option-chain endpoint uses the dashboard token in `Authorization`; a per-minute TOTP login is not required. No KV namespace is needed.

## Vercel swing API

Deploy this branch (`vercel-swing-api`) as a Vercel project. The API route is `POST /api/liquidity-swing`; it accepts the selected CALL and PUT tokens and returns their swing-high analysis. The Worker cron and option-chain lookup remain on Cloudflare.

Swagger UI is available at `/swagger.html`, with the OpenAPI definition at `/openapi.json`.

Configure these Vercel environment variables:

- `KOTAK_NEO_API_TOKEN`: the same plain NEO API Dashboard token used by the Worker.
- `KOTAK_NEO_BASE_URL`: the `baseUrl` returned by `tradeApiValidate`.
- `SWING_API_SECRET`: a strong random secret shared with the Worker.

Set `SWING_API_URL` in the Cloudflare Worker to the deployed Vercel URL (for example, `https://your-project.vercel.app/api/liquidity-swing`) and set `SWING_API_SECRET` to the same value as Vercel's variable.

The endpoint accepts only authenticated requests, does not cache responses, and fetches the CALL and PUT histories sequentially to limit Kotak request rate.

## Deploy

Authenticate Wrangler with your Cloudflare account, then deploy:

```sh
npx wrangler login
npm run deploy
```

View deployed Worker logs with:

```sh
npm run tail
```

The cron expression is configured in `wrangler.jsonc` as `* * * * *`.

