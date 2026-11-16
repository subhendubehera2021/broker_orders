# NIFTY Liquidity Swing API

A Fastify API deployed on Vercel. Each authenticated GET fetches the NIFTY option chain, selects the highest-volume CALL and PUT, fetches one-minute candles for both, calculates their latest confirmed liquidity swing highs, and stores the results in Turso. It runs on demand; no cron is configured in this branch.

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
- `NIFTY_OPTION_CHAIN_COUNT`: number of option-chain items to request (default `10`).
- `SWING_API_SECRET`: a strong random bearer-token secret. Set the same value in the Cloudflare Worker environment.
- `TURSO_DATABASE_URL`: the database URL from Turso.
- `TURSO_AUTH_TOKEN`: the database authentication token from Turso.

Create the `liquidity_swing_results` table. Each successful API request writes CALL and PUT rows together under one `scan_id`. If you created the earlier table before option-chain data was added, run these migrations once:

```sql
ALTER TABLE liquidity_swing_results ADD COLUMN symbol TEXT;
ALTER TABLE liquidity_swing_results ADD COLUMN option_volume REAL;
```

Do not put credentials in source files or expose them in logs. The endpoint uses the dashboard token in `Authorization`; a per-minute TOTP login is not required.

## API and Swagger

- `GET /api/liquidity-swing`: fetch the chain, analyze the highest-volume CALL and PUT, and save both results.
- `/swagger.html`: interactive Swagger UI.
- `/openapi.json`: OpenAPI 3.1 definition.

Vercel detects the Fastify application from the root `app.js`. Deploy the `vercel-swing-api` branch as a Vercel project. Each GET requires the shared-secret bearer authorization.

## Swing algorithm attribution

The swing-high calculation is adapted from Liquidity Swings by LuxAlgo, licensed under CC BY-NC-SA 4.0. The adaptation retains the same noncommercial restriction; commercial use requires permission from the rights holder.
