# Cron Demo Worker

A Cloudflare Worker with a Cron Trigger that runs every minute, waits until 59 seconds past the scheduled minute, and then calls the liquidity-swing API. It logs the cron timing and API response status. If Cloudflare starts an invocation after the 59-second target, the API call will be late.

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

For local development, create a `.dev.vars` file with the `LIQUIDITY_SWING_API_TOKEN` value. This file is git-ignored; do not commit the token.

## API token

Set the token as a Cloudflare secret before deploying:

```sh
npx wrangler secret put LIQUIDITY_SWING_API_TOKEN
```

Paste the token when Wrangler prompts for it. Do not include the `Bearer ` prefix.

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
