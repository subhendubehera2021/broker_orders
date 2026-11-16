# Cron Demo Worker

A minimal Cloudflare Worker with a Cron Trigger that runs every minute and waits until 3 seconds past the scheduled minute before logging the cron expression and timestamps in India Standard Time. It does not call external APIs. If Cloudflare starts an invocation after the 3-second target, the log will be late.

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
