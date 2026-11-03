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
multiple of that contract's lot size. Supported products are `NRML` and `MIS`;
order types are `L`, `MKT`, `SL`, and `SL-M`.

Example limit-order request:

```sh
curl http://127.0.0.1:3000/api/options/nifty/order \
  -H 'Content-Type: application/json' \
  --data '{"expiry":"03NOV2026","tradingSymbol":"NIFTY03NOV2026CE","transactionType":"B","quantity":"75","product":"MIS","orderType":"L","price":"100","validity":"DAY"}'
```

Replace the example symbol and quantity with a contract and lot multiple from
the selected local expiry. The server supplies Kotak's exchange segment and
order defaults, and does not expose broker tokens to the browser. Order
submission has no automatic retry or idempotency guarantee: if the API returns
502, 503, or 504, the request may have reached Kotak despite the uncertain
response. Check the Kotak Neo order book before submitting it again. The option
chain BUY buttons open a ticket prefilled with one lot; select the trigger and
limit prices and confirm the live order before submission. The UI currently
uses the `MIS` product and a stop-loss-limit (`SL`) order.

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
- `KOTAK_NEO_PLACE_ORDER_PATH` and `KOTAK_NEO_ORDER_SOURCE` — the live order
  endpoint and source identifier. These are optional for application startup
  but must both be set to enable live order placement.
- `KOTAK_NEO_QUOTES_PATH` — quote endpoint template; retain the
  `{neo_symbols}` and `{quote_type}` placeholders.
- `KOTAK_NEO_REQUEST_TIMEOUT_MS` — upstream request timeout in milliseconds.
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
