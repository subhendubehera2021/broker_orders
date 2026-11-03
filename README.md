# Kotak Neo API

A Node.js, TypeScript, and Fastify starter service for Kotak Neo authentication.
It implements the TOTP login and MPIN validation flow; order placement, market
data, and portfolio endpoints are not included yet.

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
- `POST /api/auth/login` — submit the current TOTP. The service uses the
  server-side mobile number, UCC, and MPIN to complete authentication.
- `GET /api/auth/session` — check whether this process has an authenticated
  session. Broker tokens are never returned.
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
