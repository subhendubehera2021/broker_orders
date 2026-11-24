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

Open `http://localhost:8787/` for the combined WebSocket dashboard or `http://localhost:8787/live-price` for the standalone live-price monitor. Enter the `ORDER_STREAM_CONTROL_TOKEN` on the page; on the combined dashboard, **Connect** starts the order stream and **Watch live price** starts the market feed. The standalone page focuses on the market feed. Both streams use authenticated Server-Sent Events (SSE). The combined dashboard displays each order message and connection acknowledgement as a row in separate tables, keeps the newest row at the top highlighted, replays up to the latest 50 in-memory frames on connection, and then pushes new ones. Frame previews are capped at 16,384 characters each. **Refresh status** makes a one-time status request. The token stays in the current tab.

The right-side **Live stock price** panel uses Kotak's separate market-data WebSocket and defaults to `nse_cm|Nifty 50`. Change the value to another Kotak instrument in `exchange|instrument` format (for example, `nse_cm|1333`, using the instrument token from Kotak's Scrip Master) and select **Watch live price**. This on-demand feed streams the latest price and change through authenticated SSE; it does not use or alter the order-stream connection or its Cron Trigger. Opening either dashboard starts the background Nifty connection; the once-per-minute trigger restores it if needed. Market ticks are not written to Worker logs. If a feed handshake stalls for 15 seconds or Kotak rejects a subscription, the Worker closes the socket and retries with exponential backoff. Invalid or expired credentials still need to be refreshed.

The same protected controls are available as HTTP endpoints:

```sh
curl -X POST http://localhost:8787/internal/order-stream/start \
  -H "Authorization: Bearer your-order-stream-control-token"

curl http://localhost:8787/internal/order-stream/status \
  -H "Authorization: Bearer your-order-stream-control-token"

curl -N http://localhost:8787/internal/order-stream/events \
  -H "Authorization: Bearer your-order-stream-control-token"

curl -X POST http://localhost:8787/internal/market-price/restart \
  -H "Authorization: Bearer your-order-stream-control-token"
```

The market-price restart endpoint closes and immediately reconnects the market-data WebSocket while preserving Nifty 50 and all saved instrument subscriptions.

## Kotak WebSocket credentials

The WebSockets need the session token and `Sid` returned by Kotak's login/`tradeApiValidate` flow, plus the Kotak base URL. The Dashboard API token alone is not sufficient. For local development, copy `.env.example` to the git-ignored `.env` file and fill in the values.

Keep the Kotak values from the same fresh login response together: `data.token` goes in `KOTAK_WS_SESSION_TOKEN`, `data.sid` in `KOTAK_WS_SID`, `data.baseUrl` in `KOTAK_NEO_BASE_URL`, and `data.feedUrl` in `KOTAK_MARKET_DATA_FEED_URL`. The market-data WebSocket uses `KOTAK_WS_SID` for its `auth` value and also requires `KOTAK_MARKET_DATA_UCC`. If no feed URL is configured, it defaults to `wss://sfeed.kotaksecurities.com/apifeed`.

For deployment, set the session values as Cloudflare secrets. Set the base URL as a Worker variable in `wrangler.jsonc` or as a secret:

```sh
npx wrangler secret put LIQUIDITY_SWING_API_TOKEN
npx wrangler secret put KOTAK_WS_SESSION_TOKEN
npx wrangler secret put KOTAK_WS_SID
npx wrangler secret put KOTAK_MARKET_DATA_UCC
npx wrangler secret put KOTAK_MARKET_DATA_FEED_URL
npx wrangler secret put KOTAK_NEO_BASE_URL
npx wrangler secret put ORDER_STREAM_CONTROL_TOKEN
```

Keep `LIQUIDITY_SWING_API_TOKEN` configured for the existing cron. Do not commit credentials. Session credentials expire; after each Kotak login, update the token, SID, base URL, and feed URL together. The Worker sends the broker's required authentication frame immediately after opening the connection.

## Automatic sells for buy fills

Automatic sells are enabled by default with `AUTO_SELL_ENABLED` in `wrangler.jsonc`. For each BUY update with a positive filled quantity (`fldQty`), the Worker submits a stop-limit SELL for only the newly filled increment. Repeated cumulative updates do not duplicate previously submitted quantities. The sell uses the buy's product (`prod`) and `trdSym` (falling back to `sym`); both `triggerPrice` and `price` are set to the incremental fill's average price minus `AUTO_SELL_OFFSET_POINTS` (default `3`). Set this Wrangler variable to change the offset. The tag combines the originating order number and cumulative filled quantity. A partially filled BUY is protected immediately, and later fills create additional sell orders. Sell orders and zero-fill BUY updates are ignored.

The Worker treats `fldQty` and `avgPrc` as cumulative values and derives the latest increment's average execution price from successive updates. Set `AUTO_SELL_ENABLED` to `"false"` to disable this behavior. The Worker records each attempted cumulative quantity in Durable Object storage before submitting it. If a request fails or its outcome is uncertain, that increment is not retried automatically; check the external order service and broker before manually retrying. The API endpoint treats any HTTP 2xx response as submitted.

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

The dashboard is available at the Worker root URL; the standalone live-price monitor is at `/live-price`. Enter the `ORDER_STREAM_CONTROL_TOKEN` to connect or inspect the order stream and watch a market price; the token is not stored by the page or included in either stream URL. The order and market-price feeds use separate Durable Objects and authenticated SSE endpoints. The existing cron expression remains `* * * * *` and retains its Vercel API call. A separate `*/1 * * * *` trigger starts/checks the order stream and maintains a background market-data connection subscribed to `nse_cm|Nifty 50`, even with no live-price page open. Other requested instruments are added as needed; the default Nifty subscription is never explicitly unsubscribed. Both WebSocket connections handle refresh and reconnect alarms independently.
