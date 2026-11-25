# Auto Trade Processor

Simple Express API with Swagger UI.

## Structure

- `src/server.js` starts the HTTP server.
- `src/app.js` configures Express and mounts routes.
- `src/routes/` and `src/controllers/` contain API endpoints and handlers.
- `src/services/` contains the reusable Fyers client and historical-data service.
- `src/middleware/` validates API query parameters.
- `src/docs/swagger.js` contains the OpenAPI definition and Swagger UI.

## Run

Set `FYERS_APP_ID` and `FYERS_ACCESS_TOKEN` in `.env` (see `.env.example`).

```sh
npm install
npm run dev
```

`npm run dev` uses Nodemon to restart the server when files under `src/` change. Use `npm start` to run it without watch mode.

Set `PORT` to change the default port (`3000`).

- Health check: `http://localhost:3000/api/health`
- Historical data: `GET /api/market-data/historical-data`
- Option chain: `GET /api/market-data/option-chain`
- Quotes: `GET /api/market-data/quotes`
- API index: `http://localhost:3000/`
- Swagger UI: `http://localhost:3000/docs`

Example:

```sh
curl "http://localhost:3000/api/market-data/historical-data?symbol=NSE%3ASBIN-EQ&resolution=D&date_format=0&range_from=1690895316&range_to=1691068173"
```

`date_format=0` uses epoch timestamps; use `date_format=1` with `YYYY-MM-DD` dates instead. `cont_flag` and `oi_flag` are optional.

Option-chain example:

```sh
curl "http://localhost:3000/api/market-data/option-chain?symbol=NSE%3ANIFTY50-INDEX&strikecount=1&timestamp=&greeks=1"
```

Quotes example (up to 50 comma-separated symbols):

```sh
curl "http://localhost:3000/api/market-data/quotes?symbols=NSE%3ASBIN-EQ%2CNSE%3ATCS-EQ"
```
