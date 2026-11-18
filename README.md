# NIFTY Liquidity Swing API

A Fastify API deployed on Vercel. The authenticated option-chain endpoint fetches the NIFTY option chain, selects the highest-volume CALL and PUT, and keeps one latest row per side in Turso. The liquidity-swing endpoint also fetches one-minute candles for both, calculates their latest confirmed swing highs, and stores the results. It runs on demand; no cron is configured in this branch.

## Local development

Use Node.js 26, install dependencies, and start Fastify:

```sh
npm install
node --env-file=.env app.js
```

The server listens on port `3000` and prints its localhost and network URLs
when it starts. To run tests:

```sh
npm test
```

For Fyers login, configure these values in `.env` and register the exact
redirect URL in your Fyers API application:

```dotenv
FYERS_APP_ID=your-app-id
FYERS_APP_SECRET=your-app-secret
FYERS_REDIRECT_URI=http://127.0.0.1:3000/auth/fyers/callback
```

Open [http://127.0.0.1:3000/fyers-login](http://127.0.0.1:3000/fyers-login)
and select **Login with Fyers**. The access token is held in an encrypted,
HttpOnly session cookie, so the session works across Vercel function instances
without exposing the token to page JavaScript. The cookie key is derived from
the Fyers app credentials. Fyers tokens expire daily, so log in again when
prompted. For deployment, use an HTTPS redirect URL configured in the Fyers
developer portal.

Open [http://127.0.0.1:3000/trading-view](http://127.0.0.1:3000/trading-view)
for the chart. Sign in first, then enter a Fyers symbol such as
`NSE:NIFTY50-INDEX` or `NSE:SBIN-EQ`. Historical candles and five-second quote
polling require the Market Data permission in the Fyers API app. Chart-axis,
crosshair, and quote-update times are displayed in India Standard Time (IST).

## Vercel environment variables

Configure these variables for the Vercel environment:

- `KOTAK_NEO_API_TOKEN`: the plain NEO API Dashboard token (not the session JWT).
- `KOTAK_NEO_BASE_URL`: the `baseUrl` returned by `tradeApiValidate`.
- `NIFTY_OPTION_CHAIN_COUNT`: number of option-chain items to request (default `10`).
- `SWING_API_SECRET`: a strong random bearer-token secret. Set the same value in the Cloudflare Worker environment.
- `TURSO_DATABASE_URL`: the database URL from Turso.
- `TURSO_AUTH_TOKEN`: the database authentication token from Turso.
- `FYERS_APP_ID`, `FYERS_APP_SECRET`, and `FYERS_REDIRECT_URI`: required for the
  Fyers OAuth login page. Set the redirect URL to the deployed
  `/auth/fyers/callback` endpoint.

Run [`db.sql`](./db.sql) to create the required tables. `nifty_option_chain_ce` and `nifty_option_chain_pe` each hold one row; every option-chain request updates that side's existing row rather than adding history. The `liquidity_swing_results` table keeps its separate append-only analysis behavior: a unique index prevents duplicate rows for the same `symbol`, `token`, `pivot_lookback`, `interval`, and `pivot_time`. If those five values match, the insert is skipped—even if other metrics changed; existing rows are not updated. A different key creates a new row. `insertedRows` in the response tells you how many analysis rows were added.

If you created the earlier table before option-chain data was added, first add the missing columns once:

```sql
ALTER TABLE liquidity_swing_results ADD COLUMN symbol TEXT;
ALTER TABLE liquidity_swing_results ADD COLUMN option_volume REAL;
```

Then create the unique index from `db.sql`. If duplicate key rows already exist, remove or merge them before creating that index.

Do not put credentials in source files or expose them in logs. The endpoint uses the dashboard token in `Authorization`; a per-minute TOTP login is not required.

## API and Swagger

- `GET /api/nifty-option-chain`: return the highest-volume CALL and PUT from the current NIFTY option chain and update the latest CE/PE rows in Turso; does not analyze swings.
- `GET /api/liquidity-swing`: fetch the chain, analyze the highest-volume CALL and PUT, and save both results.
- `GET /fyers-login`: Fyers OAuth login page.
- `GET /auth/fyers/login` and `GET /auth/fyers/callback`: start and complete Fyers OAuth login.
- `GET /api/fyers/session` and `POST /api/fyers/logout`: report or clear the Fyers login state.
- `GET /trading-view`: interactive Fyers candlestick/bar chart with volume, liquidity-swing levels, drawing tools, and periodic quote updates.
- `GET /api/fyers/candles` and `GET /api/fyers/quote`: authenticated chart data endpoints.
- `/swagger.html`: interactive Swagger UI.
- `/openapi.json`: OpenAPI 3.1 definition.

Vercel detects the Fastify application from the root `app.js`. Deploy the `vercel-swing-api` branch as a Vercel project. Each GET requires the shared-secret bearer authorization.

## Swing algorithm attribution

The swing-high calculation is adapted from Liquidity Swings by LuxAlgo, licensed under CC BY-NC-SA 4.0. The adaptation retains the same noncommercial restriction; commercial use requires permission from the rights holder.

The chart uses TradingView Lightweight Charts under the Apache License 2.0 and includes its required attribution link in the chart footer.


