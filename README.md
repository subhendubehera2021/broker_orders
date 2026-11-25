# Auto Trade Processor

Simple Express API with Swagger UI.

## Structure

- `src/server.js` starts the HTTP server.
- `src/app.js` configures Express and mounts the API.
- `src/api.routes.js` mounts the Fyers and internal API modules.
- `src/fyers/` contains Fyers routes, controllers, validation, services, models, and constants.
- `src/fyers/models/` describes Fyers response shapes such as the option chain.
- `src/auto-trade-process/` contains the auto-trade-process route, controllers, validation, response models, services, and candle aggregation.
- `src/internal/` contains internal routes, controllers, validation, and liquidity-swing analysis.
- `src/utils/` and `src/docs/` contain shared date helpers and Swagger documentation.

## Run

Set `FYERS_APP_ID`, `FYERS_ACCESS_TOKEN`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` in `.env` (see `.env.example`). The database client also accepts the existing `_v2` Turso variable names.

```sh
npm install
npm run dev
```

`npm run dev` uses Nodemon to restart the server when files under `src/` change. Use `npm start` to run it without watch mode.

Set `PORT` to change the default port (`3000`).

- Internal health check: `http://localhost:3000/api/internal/health`
- Fyers expired F&O data: `GET /api/fyers/market-data/expired-fo-data`
- Fyers expired contracts: `GET /api/fyers/market-data/expired-fo-data/contracts`
- Fyers expired expiry dates: `GET /api/fyers/market-data/expired-fo-data/expiry-dates`
- Fyers historical data: `GET /api/fyers/market-data/historical-data`
- Fyers option chain: `GET /api/fyers/market-data/option-chain`
- Fyers quotes: `GET /api/fyers/market-data/quotes`
- Internal liquidity swings: `GET /api/internal/liquidity-swings`
- Internal highest-volume options: `GET /api/internal/option-chain/highest-volume`
- Auto-trade-process data: `GET /api/auto-trade-process`
- API index: `http://localhost:3000/`
- Swagger UI: `http://localhost:3000/docs`

Previous `/api/market-data/*`, `/api/liquidity-swings`, and `/api/health` paths remain available as compatibility aliases.

Example:

```sh
curl "http://localhost:3000/api/fyers/market-data/historical-data?symbol=NSE%3ASBIN-EQ&resolution=D&date_format=0&range_from=1690895316&range_to=1691068173"
```

Expired F&O historical data example:

```sh
curl "http://localhost:3000/api/fyers/market-data/expired-fo-data?symbol=NSE%3ANIFTY25MAR23000CE&resolution=60&date_format=1&range_from=2025-03-26&range_to=2025-03-27&include_oi=1&include_greeks=1"
```

Get NIFTY expired futures and options contracts for an expiry date:

```sh
curl "http://localhost:3000/api/fyers/market-data/expired-fo-data/contracts?symbol=NSE%3ANIFTY50-INDEX&expiry_date=2025-03-27"
```

Get NIFTY expiry dates in a date range:

```sh
curl "http://localhost:3000/api/fyers/market-data/expired-fo-data/expiry-dates?symbol=NSE%3ANIFTY50-INDEX&range_from=2025-01-01&range_to=2025-03-31&date_format=1"
```

`date_format=0` uses epoch timestamps; use `date_format=1` with `YYYY-MM-DD` dates instead. `cont_flag` and `oi_flag` are optional.

Option-chain example:

```sh
curl "http://localhost:3000/api/fyers/market-data/option-chain?symbol=NSE%3ANIFTY50-INDEX&strikecount=1&timestamp=&greeks=1"
```

Quotes example (up to 50 comma-separated symbols):

```sh
curl "http://localhost:3000/api/fyers/market-data/quotes?symbols=NSE%3ASBIN-EQ%2CNSE%3ATCS-EQ"
```

## Liquidity-swing library

The library fetches Fyers candles and analyzes the latest confirmed liquidity swing high:

```js
import {
  fetchLiquiditySwings,
  recentIndiaDateRange,
} from "./src/internal/lib/liquidity-swings.js";

const result = await fetchLiquiditySwings("NSE:SBIN-EQ", {
  ...recentIndiaDateRange(),
  resolution: "1",
  pivotLookback: 5,
});
```

The same analysis is available over HTTP. Dates default to the recent three-day India date range:

```sh
curl "http://localhost:3000/api/internal/liquidity-swings?symbol=NSE%3ASBIN-EQ&resolution=1&pivotLookback=5"
```

Find the highest-volume CE and PE contracts. LTP bounds are optional and inclusive; omit both to search all returned strikes:

```sh
curl "http://localhost:3000/api/internal/option-chain/highest-volume?symbol=NSE%3ANIFTY50-INDEX&strikecount=1&greeks=0&ltpMin=100&ltpMax=300"
```

Pass the option-chain settings and inclusive LTP range to the auto-trade-process endpoint. Set `resolution` and `pivotLookback` to configure the Step 2 liquidity-swing analysis; they default to `1` (one minute) and `5`:

```sh
curl "http://localhost:3000/api/auto-trade-process?symbol=NSE%3ANIFTY50-INDEX&strikecount=50&greeks=0&ltpMin=100&ltpMax=140&resolution=5&pivotLookback=8"
```

For multiple configurations, send a JSON body with `POST`. Step 2 reuses one-minute data per selected symbol for all 1-minute configurations and to build 3-minute candles locally from three consecutive complete 1-minute candles. Other supported resolutions are fetched directly from Fyers:

```sh
curl -X POST "http://localhost:3000/api/auto-trade-process" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "NSE:NIFTY50-INDEX",
    "strikecount": 50,
    "greeks": 0,
    "ltpMin": 100,
    "ltpMax": 140,
    "swingConfigs": [
      { "resolution": "1", "pivotLookback": 5 },
      { "resolution": "1", "pivotLookback": 7 },
      { "resolution": "1", "pivotLookback": 14 },
      { "resolution": "3", "pivotLookback": 5 },
      { "resolution": "3", "pivotLookback": 7 },
      { "resolution": "3", "pivotLookback": 14 }
    ]
  }'
```

The response includes the selected CE/PE contracts and a Step 2 result for each requested liquidity-swing configuration. The endpoint does not place orders.

Changed swing results are saved to the automatically created `auto_trade_liquidity_swing_history` table. The latest result for an option symbol, side, resolution, pivot lookback, and date range is checked before inserting; unchanged results are skipped. When it changes, a new history row is added. Any existing `auto_trade_liquidity_swing_state` rows are migrated into the history table before the old state table is removed. The response's `step2.persistence` reports inserted and unchanged results. Ensure the Turso credentials are configured before calling this endpoint.

This LuxAlgo-based adaptation is licensed CC BY-NC-SA 4.0 and is for noncommercial use with attribution and share-alike terms: https://creativecommons.org/licenses/by-nc-sa/4.0/
