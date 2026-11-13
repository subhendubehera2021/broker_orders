# Kotak Neo API

A Node.js, TypeScript, and Fastify service for Kotak Neo authentication, NIFTY
option market data, margin estimates, and validated live NIFTY option orders.

## Requirements

- Node.js 22 or later
- A Kotak Neo Trade API consumer key
- TOTP enabled for the Kotak Neo account

## Run locally

```sh
npm install
cp .env.example .env
# Set KOTAK_NEO_CONSUMER_KEY in .env
npm run dev
```

The checked-in environment template is configured for Kotak Neo production.

The web frontend is protected by a passcode configured through
`WEB_ACCESS_PASSCODE` in `.env`. A successful unlock stays active in that
browser until midnight India time. API routes remain directly accessible and
are not protected by this frontend gate.

To run the compiled service under PM2, install PM2 globally and use:

```sh
npm install --global pm2
npm run start:pm2
```

Manage the process with `pm2 status`, `pm2 logs kotak-neo-api`, and
`pm2 restart kotak-neo-api`.

Add `KOTAK_NEO_ORDER_BOOK_PATH=quick/user/orders` to `.env` to enable the
Orders page and API.

## API documentation

Start the service and open [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs)
for interactive Swagger UI. The generated OpenAPI document is available at
`/docs/json`.

The login screen is available at [http://127.0.0.1:3000/](http://127.0.0.1:3000/).
It pre-fills the mobile number and UCC from local server settings. The MPIN
stays server-side; only the current TOTP is submitted by the browser.

## Endpoints

- `GET /health` — process health check.
- `GET /margin` — standalone margin calculator UI; requires an active local
  Kotak Neo session to show the calculator form.
- `GET /scrip-master` — browse and search the full NSE F&O instrument list.
- `GET /option-chain` — NIFTY option-chain UI using local contract data, with
  optional live index streaming after Kotak Neo sign-in.
- `GET /auto-trade` — analyze historical Kotak Neo candles for NIFTY option
  liquidity swings; choose an instrument, interval, and date range.
- `GET /orders` — view the authenticated Kotak Neo order book, separated into
  all, open, and closed orders.
- `GET /order-stream` — view live order lifecycle and position updates.
- `GET /api/orders` — retrieve the authenticated Kotak Neo order-book response.
- `GET /api/positions` — retrieve current positions from Kotak Neo; the Live
  activity page loads this snapshot before applying streaming updates.
- `GET /api/orders/stream` — authenticated Server-Sent Events relay for Kotak's
  order and position WebSocket stream. The broker connection uses the
  `/realtime` endpoint returned via the authenticated session base URL.
- `POST /api/orders/{orderNumber}/cancel` — cancel an order only if it is still
  open in the current order book.
- `POST /api/orders/{orderNumber}/modify` — forward the supplied order details
  to Kotak Neo without local order-book, Scrip Master, or trading-rule checks.
  Kotak Neo determines whether the modification is accepted or rejected.
- `POST /api/auth/login` — submit the current TOTP. The service uses the
  server-side mobile number, UCC, and MPIN to complete authentication.
- `GET /api/auth/session` — check whether this process has an authenticated
  session. Broker tokens are never returned.
- `GET /api/market/nifty/stream` — stream live NIFTY 50 index prices from the
  Kotak Neo market-data WebSocket, relayed as Server-Sent Events. Add
  `?expiry=DDMMMYYYY` to stream live prices for the currently displayed NIFTY
  options too.
- `GET /api/scrip-master` — retrieve Scrip Master file paths from Kotak Neo.
- `GET /api/scrip-master/nse-fo` — retrieve the NSE F&O Scrip Master CSV.
- `GET /api/options/nifty/expiries` — list NIFTY option expiries from the
  local NSE F&O CSV.
- `GET /api/options/nifty/chain?expiry=DDMMMYYYY` — get local contract details
  for a selected NIFTY expiry.
- `GET /api/auto-trade/liquidity-swings?instrument=NIFTY26N0925100PE&interval=1min&pivotLookback=5&fromdate=2026-11-01&todate=2026-11-09`
  — fetch historical OHLCV candles for the local NIFTY option contract and
  return detected swing levels. Pivot lookback accepts 3, 5, 10, 14, or 20
  candles and defaults to 5. Requires a Kotak Neo session. The endpoint enforces
  Kotak's interval-specific maximum date ranges.
- `POST /api/margin` — check the required margin for the supplied order details
  using the current authenticated session. This does not place an order.
- `POST /api/options/nifty/order` — submit a live NIFTY option order. Requires an
  authenticated Kotak Neo session and a contract in the local NSE F&O Scrip
  Master.
- `POST /api/auth/logout` — clear the in-memory session from this process. This
  does not revoke the session with Kotak Neo.

Example login request:

```json
{ "totp": "123456" }
```

The login response contains only `{ "authenticated": true }`. Session tokens
are held in process memory and are lost when the service restarts. This is a
single-process starter, not a multi-user session store. Logout only discards
the local tokens; use Kotak Neo's own session controls to revoke broker-side
access.

After TOTP/MPIN validation, the service uses Kotak's returned `data.baseUrl`
for authenticated post-login API requests (quotes, margin, and orders). The
returned URL must be HTTPS on a `kotaksecurities.com` host; when it is absent,
the configured `KOTAK_NEO_API_BASE_URL` remains the compatibility fallback.
If Kotak supplies `data.hsServerId`, the client includes it as the optional
`sId` query parameter; order submission does not depend on that field.

Retrieve Scrip Master paths through this service (the configured Neo API token
is attached server-side):

```sh
curl http://127.0.0.1:3000/api/scrip-master
```

Browse all NSE F&O instruments at
[http://127.0.0.1:3000/scrip-master](http://127.0.0.1:3000/scrip-master).
The page provides search across every field, pagination, and a CSV download.

Open the NIFTY option chain at
[http://127.0.0.1:3000/option-chain](http://127.0.0.1:3000/option-chain) without
signing in to browse contracts. Contract details and expiries are read from the
local [`src/nse_fo.csv`](./src/nse_fo.csv) file. The page also displays the live
NIFTY 50 index price from Kotak Neo's WebSocket feed; sign in first to enable
live market data. The stream uses the account-specific `feedUrl` returned
during login and the configured `KOTAK_NEO_NIFTY_INDEX_TOKEN` and
`KOTAK_NEO_NIFTY_INDEX_SEGMENT` values (`Nifty 50` and `nse_cm` in `.env.example`).
For the selected expiry, the page displays live LTPs for the three nearest
strike prices below and above the live NIFTY price (six calls and six puts).
The contracts are loaded through `/api/options/nifty/chain`; the market stream
subscribes only to the currently displayed option tokens and follows the
nearest strikes as NIFTY moves. Prices use Kotak Neo's NSE F&O WebSocket feed.
Replace the CSV with an updated NSE F&O Scrip Master when you need new
contracts. The page groups calls and puts by strike and supports expiry
selection. Streaming follows Kotak's
[market-data WebSocket guide](https://github.com/Kotak-Neo/Kotak-Neo/blob/main/docs/market-data-apis/websocket.md).

The margin calculator has a separate UI route at
[http://127.0.0.1:3000/margin](http://127.0.0.1:3000/margin). Sign in at `/`
first; the calculator checks the active session before showing the form.
The equivalent API request accepts the order fields from Kotak Neo's `jData`
as JSON:

```sh
curl http://127.0.0.1:3000/api/margin \
  -H 'Content-Type: application/json' \
  --data '{"brkName":"KOTAK","brnchId":"ONLINE","exSeg":"nse_cm","prc":"12500","prcTp":"L","prod":"CNC","qty":"1","tok":"11536","trnsTp":"B"}'
```

The service sends this to Kotak Neo as a form-encoded `jData` field and adds
the current session token, session ID, and financial key server-side.

## Live NIFTY option orders

`POST /api/options/nifty/order` places a real order with Kotak Neo. The endpoint
only accepts a NIFTY option whose exact expiry and trading symbol are present in
the local `src/nse_fo.csv` Scrip Master. Quantity is in units and must be a
multiple of that contract's lot size. The order ticket supports BUY and SELL,
`L`, `MKT`, `SL`, and `SL-M` order types, and the `MIS`, `NRML`, `CO`, and
`BO` products. `CNC` and `MTF` are not valid for NIFTY F&O. Market and
stop-market orders send price `"0"`; stop orders and cover orders require a
trigger price. Bracket orders require square-off/stop-loss types and values,
plus trailing-stop settings. The server resolves the bracket order's scrip
token from the local Scrip Master rather than accepting one from the browser.
`DAY`/`IOC`, AMO, disclosed quantity, market protection, and an optional tag
are also configurable in the ticket.

Example limit-order request:

```sh
curl http://127.0.0.1:3000/api/options/nifty/order \
  -H 'Content-Type: application/json' \
  --data '{"expiry":"03NOV2026","tradingSymbol":"NIFTY03NOV2026CE","transactionType":"B","quantity":"75","product":"MIS","orderType":"L","price":"100","validity":"DAY"}'
```

Replace the example symbol and quantity with a contract and lot multiple from
the selected local expiry. For a bracket order (`"product":"BO"`), also supply
`squareOffType`, `squareOffValue`, `stopLossType`, `stopLossValue`,
`trailingStopLoss`, and `trailingSlValue`; the server adds Kotak's `tk` field
from the Scrip Master. The server supplies Kotak's exchange segment and order
defaults, and does not accept a broker token from the browser. Order submission
has no automatic retry or idempotency guarantee: if the API returns 502, 503,
or 504, the request may have reached Kotak despite the uncertain response.
Check the Kotak Neo order book before submitting it again. The option-chain BUY
buttons open a ticket prefilled with one lot; review and confirm the live order
before submission.

For app-submitted BUY orders using MIS or NRML, the server arms an automatic
SELL after Kotak's order stream reports the full fill. The SELL is an SL-limit
order for the filled quantity, with its limit and trigger set to ₹5 below the
average fill price (rounded to the nearest ₹0.05). The app shows armed,
submitted, or failed status in Live activity. CO and BO BUY orders are not
eligible. This automation runs on the authenticated server-side order stream,
not in the browser; it stays active while the service is running and logged in.
Pending auto-sells are held in memory and are lost if the service restarts or
you log out. Configure `KOTAK_NEO_ORDER_BOOK_PATH` to reconcile pending BUYs
after a stream reconnect. An SL-limit order may not fill if the market moves
past its limit price, so this is not a guaranteed exit or a guaranteed loss cap.

## Configuration

Copy `.env.example` to `.env` and set the values supplied for your Kotak Neo
application:

- `KOTAK_NEO_CONSUMER_KEY` — the API token generated in the Kotak Neo app or website.
- `KOTAK_NEO_MOBILE_NUMBER` and `KOTAK_NEO_UCC` — your account's registered
  mobile number and unique client code.
- `KOTAK_NEO_MPIN` — your account MPIN. The server uses it for login; it is
  never sent to or rendered in the browser.
- `KOTAK_NEO_FIN_KEY` — the Neo financial key for production.
- `KOTAK_NEO_API_BASE_URL` — the broker API base URL.
- `KOTAK_NEO_TOTP_LOGIN_PATH` and `KOTAK_NEO_TOTP_VALIDATE_PATH` — the
  environment-specific authentication paths.
- `KOTAK_NEO_SCRIP_MASTER_PATH` — the Scrip Master file-path endpoint.
- `KOTAK_NEO_MARGIN_PATH` — the check-margin endpoint.
- `KOTAK_NEO_ORDER_BOOK_PATH` — the order-book endpoint used by the Orders page.
- `KOTAK_NEO_CANCEL_ORDER_PATH` — the cancel-order endpoint used for open orders;
  set it to `quick/order/cancel` to enable cancellation.
- `KOTAK_NEO_MODIFY_ORDER_PATH` — the modify-order endpoint used for open NIFTY
  option orders; set it to `quick/order/vr/modify` to enable modification.
- `KOTAK_NEO_POSITIONS_PATH` — the current-positions endpoint used by Live
  activity; set it to `quick/user/positions`.
- `KOTAK_NEO_PLACE_ORDER_PATH` and `KOTAK_NEO_ORDER_SOURCE` — the live order
  endpoint and source identifier. These are optional for application startup
  but must both be set to enable live order placement.
- `KOTAK_NEO_LOG_LOGIN_RESPONSES` — set to `true` temporarily to log Kotak's
  TOTP login and validation response fields for diagnostics. Token, session,
  server ID, and other sensitive values are redacted; defaults to `false`.
- `KOTAK_NEO_QUOTES_PATH` — quote endpoint template; retain the
  `{neo_symbols}` and `{quote_type}` placeholders.
- `KOTAK_NEO_REQUEST_TIMEOUT_MS` — upstream request timeout in milliseconds.
- `OPEN_ORDER_PRICE_STEP` — rupee increment used by the Open orders Up/Down
  shortcuts; must be a positive multiple of ₹0.05 and defaults to `1`.
- `AUTO_SELL_STOP_LOSS_RUPEES` — rupee amount subtracted from the average fill
  price for an app-managed auto-sell stop-limit; defaults to `5`.
- `HOST` and `PORT` — service bind address and port.

The service reads all runtime settings from the environment (loaded from `.env`
for local development) and does not embed Kotak endpoint or financial-key
values in the source.

Do not commit `.env` or send API credentials, TOTP codes, or MPINs to anyone.
Keep this service on a trusted network, use HTTPS if it is accessed remotely,
and follow Kotak Neo's account and API security requirements. The service does
not log request bodies or return broker tokens.

## Development

```sh
npm test
npm run build
npm start
```

The authentication routes and URL paths follow the
[official Kotak Neo Python SDK](https://github.com/Kotak-Neo/Kotak-neo-api-v2)
production TOTP login settings. Verify current requirements with Kotak Neo
before using a production account.
