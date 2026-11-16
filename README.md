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

## Auto-trade settings KV

The Worker reads the `auto-trade-settings` key from the `AUTO_TRADE_SETTINGS` KV namespace on every scheduled run. It logs only whether the key exists, never its contents. The namespace is configured in `wrangler.jsonc`; Wrangler can provision it during deployment. KV reads are eventually consistent, so this scaffold is for settings, not trade locks or strict deduplication.

After deploying, store a JSON value in the remote namespace:

```sh
npx wrangler kv key put auto-trade-settings '{"enabled":false}' --binding=AUTO_TRADE_SETTINGS --remote
```

Replace the example with the settings document once its schema is defined. For local development, use `--local` instead of `--remote`.

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
