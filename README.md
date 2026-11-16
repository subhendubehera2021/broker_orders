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
