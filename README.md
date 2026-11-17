# NIFTY Cron and Kotak Order WebSocket Worker

A Cloudflare Worker with an existing per-minute Cron Trigger that continues to call the liquidity-swing API at 59 seconds past each scheduled minute. A separate once-per-minute Cron Trigger automatically starts/checks the Durable Object, which maintains one outbound Kotak order/position WebSocket connection. Every inbound WebSocket frame is logged in full, including order and position details; restrict Cloudflare log access and retention accordingly. The Durable Object refreshes its connection every 12 minutes and reconnects after disconnects.

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

Open `http://localhost:8787/` for the WebSocket dashboard. Enter the `ORDER_STREAM_CONTROL_TOKEN` and select **Connect** to receive live status and broker frames over an authenticated Server-Sent Events (SSE) connection. The page displays each order message and connection acknowledgement as a row in separate tables, keeps the newest row at the top highlighted, replays up to the latest 50 in-memory frames on connection, and then pushes new ones. Frame previews are capped at 16,384 characters each. **Refresh status** makes a one-time status request. The page keeps the token only in the current tab.

The right-side **Live stock price** panel uses Kotak's separate market-data WebSocket and defaults to `nse_cm|Nifty 50`. Change the value to another Kotak instrument in `exchange|instrument` format (for example, `nse_cm|1333`, using the instrument token from Kotak's Scrip Master) and select **Watch live price**. This on-demand feed streams the latest price and change through authenticated SSE; it does not use or alter the order-stream connection or its Cron Trigger.

The same protected controls are available as HTTP endpoints:

```sh
curl -X POST http://localhost:8787/internal/order-stream/start \
  -H "Authorization: Bearer your-order-stream-control-token"

curl http://localhost:8787/internal/order-stream/status \
  -H "Authorization: Bearer your-order-stream-control-token"

curl -N http://localhost:8787/internal/order-stream/events \
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
KOTAK_MARKET_DATA_UCC=your-kotak-client-code
```

The market-data WebSocket uses the static Kotak endpoint `wss://sfeed.kotaksecurities.com/apifeed`. It reuses `KOTAK_WS_SESSION_TOKEN` but requires a separate `KOTAK_MARKET_DATA_UCC` secret.

For deployment, set the session values as Cloudflare secrets. Set the base URL as a Worker variable in `wrangler.jsonc` or as a secret:

```sh
npx wrangler secret put LIQUIDITY_SWING_API_TOKEN
npx wrangler secret put KOTAK_WS_SESSION_TOKEN
npx wrangler secret put KOTAK_WS_SID
npx wrangler secret put KOTAK_MARKET_DATA_UCC
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

The dashboard is available at the Worker root URL. Enter the `ORDER_STREAM_CONTROL_TOKEN` to connect or inspect the order stream and watch a market price; the token is not stored by the page or included in either stream URL. The order and market-price feeds use separate Durable Objects and authenticated SSE endpoints. The existing cron expression remains `* * * * *` and retains its Vercel API call. A separate `*/1 * * * *` trigger starts/checks only the order stream automatically (within one minute). Both WebSocket connections handle refresh and reconnect alarms independently.
