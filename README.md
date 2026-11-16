# NIFTY Cron Worker

A minimal Cloudflare Worker with a Cron Trigger that runs every minute and logs the scheduled minute boundary and actual start time in India time. Cloudflare may start an invocation slightly after its scheduled boundary.

Wrangler requires Node.js 22.12 or newer.

## Local development

Install dependencies and run the scheduled-event simulator:

```sh
npm install
npm run dev
```

In another terminal, trigger a local scheduled event:

```sh
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

The local Wrangler console displays the dummy cron log.

## Kotak option-chain credentials

On every scheduled run, the Worker fetches the NIFTY option chain and logs the highest-volume call and put. It reads these keys from the `AUTO_TRADE_SETTINGS` KV namespace:

- `kotak-neo-api-token`: the plain API access token from the NEO API Dashboard (not the session JWT).
- `kotak-neo-base-url`: the `baseUrl` returned by `tradeApiValidate`.

Add both keys in the Cloudflare dashboard under the KV namespace bound as `AUTO_TRADE_SETTINGS`. Do not put credentials in source files or logs. The endpoint uses the dashboard token in `Authorization`; a per-minute TOTP login is not required.

KV reads are eventually consistent. This is suitable for credentials/configuration reads, not trade locks or strict deduplication.

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
