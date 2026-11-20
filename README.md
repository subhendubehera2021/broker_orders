# Minute Cron

A minimal Node.js, TypeScript, and Express project that runs an HTTP server on port 3000
and a cron task once every minute.

## Run

```sh
npm install
npm run dev
```

Set `PORT` to change the HTTP port. It defaults to `3000`.

## Endpoint

- `GET /health` — process health check.

## Commands

```sh
npm test
npm run build
npm start
npm run start:pm2
```

Use `npx pm2 status`, `npx pm2 logs minute-cron`, and `npx pm2 stop minute-cron`
to manage the PM2 process.
