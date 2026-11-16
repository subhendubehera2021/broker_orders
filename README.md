# NIFTY Cron and Kotak Order WebSocket Worker

A Cloudflare Worker with an existing per-minute Cron Trigger that continues to call the liquidity-swing API at 59 seconds past each scheduled minute. A separate five-minute Cron Trigger automatically starts/checks the Durable Object, which maintains one outbound Kotak order/position WebSocket connection. Order and position events are logged as they arrive; order numbers, account IDs, prices, and quantities are not logged. The Durable Object refreshes its connection every 12 minutes and reconnects after disconnects.

Wrangler requires Node.js 22.12 or newer.

## Local development

Install dependencies and run the local Worker:

```sh
npm install
npm run dev
```

The local Worker uses `.dev.vars` for the Vercel API and WebSocket credentials. Trigger the existing cron without changing its behavior:

```sh
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

Start the WebSocket listener separately:

```sh
curl -X POST http://localhost:8787/internal/order-stream/start \
  -H "Authorization: Bearer your-order-stream-control-token"
```

## Kotak WebSocket credentials

The WebSocket needs the session token and `Sid` returned by Kotak's login/`tradeApiValidate` flow, plus the Kotak base URL. The Dashboard API token alone is not sufficient. For local development, create a git-ignored `.dev.vars` file:

```sh
LIQUIDITY_SWING_API_TOKEN=your-vercel-api-token
ORDER_STREAM_CONTROL_TOKEN=your-random-control-token
KOTAK_NEO_BASE_URL=https://e21.kotaksecurities.com
KOTAK_WS_SESSION_TOKEN=your-session-token
KOTAK_WS_SID=your-session-sid
```

For deployment, set the session values as Cloudflare secrets. Set the base URL as a Worker variable in `wrangler.jsonc` or as a secret:

```sh
npx wrangler secret put LIQUIDITY_SWING_API_TOKEN
npx wrangler secret put KOTAK_WS_SESSION_TOKEN
npx wrangler secret put KOTAK_WS_SID
npx wrangler secret put KOTAK_NEO_BASE_URL
npx wrangler secret put ORDER_STREAM_CONTROL_TOKEN
```

Keep `LIQUIDITY_SWING_API_TOKEN` configured for the existing cron. Do not commit credentials. Session credentials expire; update the secrets after Kotak requires a new login. The Worker sends the broker's required raw authentication string immediately after opening the connection.

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

The Durable Object binding and first SQLite migration are configured in `wrangler.jsonc`. The existing cron expression remains `* * * * *` and retains its Vercel API call. A separate `*/5 * * * *` trigger starts/checks the order stream automatically (within five minutes); send an authenticated `POST` to `/internal/order-stream/start` to start it immediately. Its Durable Object handles refresh and reconnect alarms independently.
