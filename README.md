# NIFTY Liquidity Swing API

A Fastify API deployed on Vercel. It accepts a NIFTY CALL and PUT token, fetches one-minute historical candles from Kotak, and returns each instrument's latest confirmed liquidity swing high. The API does not select the option-chain instruments or run a cron; those remain in the separate Cloudflare Worker branch.

## Local development

Use Node.js 26, install dependencies, and start Fastify:

```sh
npm install
npm run dev
```

The server listens on port `3000`. To run tests:

```sh
npm test
```

## Vercel environment variables

Configure these variables for the Vercel environment:

- `KOTAK_NEO_API_TOKEN`: the plain NEO API Dashboard token (not the session JWT).
- `KOTAK_NEO_BASE_URL`: the `baseUrl` returned by `tradeApiValidate`.
- `SWING_API_SECRET`: a strong random bearer-token secret. Set the same value in the Cloudflare Worker environment.

Do not put credentials in source files or expose them in logs. The endpoint uses the dashboard token in `Authorization`; a per-minute TOTP login is not required.

## API and Swagger

- `POST /api/liquidity-swing`: analyze one CALL and one PUT token.
- `/swagger.html`: interactive Swagger UI.
- `/openapi.json`: OpenAPI 3.1 definition.

Vercel detects the Fastify application from the root `app.js`. Deploy the `vercel-swing-api` branch as a Vercel project. The Cloudflare Worker calls the deployed API using the shared `SWING_API_SECRET`.

## Swing algorithm attribution

The swing-high calculation is adapted from Liquidity Swings by LuxAlgo, licensed under CC BY-NC-SA 4.0. The adaptation retains the same noncommercial restriction; commercial use requires permission from the rights holder.
