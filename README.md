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
- `public/ui/` contains the browser UIs for Fyers expiry dates, liquidity-swing history, and historical chart replay. Vercel serves these assets from its CDN.
- `public/docs/` receives the Swagger UI static assets during the build so Vercel can serve them from its CDN.
- `src/utils/` and `src/docs/` contain shared date helpers and Swagger documentation.

## Run

Set `FYERS_APP_ID`, `FYERS_ACCESS_TOKEN`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN` in `.env` (see `.env.example`). Set either `MASTER_API_KEY` or `MASTER_PASSCODE` to protect history delete/restore actions. If both are set, `MASTER_API_KEY` takes precedence. The database client also accepts the existing `_v2` Turso variable names.

```sh
npm install
npm run build
npm run dev
```

`npm run dev` uses Nodemon to restart the server when files under `src/` change. Use `npm start` to run it without watch mode.

Set `PORT` to change the default port (`3000`).

- Internal health check: `http://localhost:3000/api/internal/health`
- Saved liquidity-swing history: `GET /api/internal/liquidity-swing-history?limit=50&offset=0`
- Update saved history deletion status: `PATCH /api/internal/liquidity-swing-history/:id`
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
- Expiry-dates UI: `http://localhost:3000/ui/`
- Liquidity-swing history UI: `http://localhost:3000/ui/history.html`
- Fyers historical replay chart: `http://localhost:3000/ui/chart.html`
- Swagger UI: `http://localhost:3000/docs`

Previous `/api/market-data/*`, `/api/liquidity-swings`, and `/api/health` paths remain available as compatibility aliases.

The history UI filters and paginates on the server. Filters include pivot-time date, resolution, option type, lookback, swing status, and traded status. The API also supports free-text search. It returns 50 active rows by default and allows up to 100 per request; its `total` value reflects the active filters. Add `includeDeleted=1` to also list deleted rows. Editing analysis or changing a row's deletion status requires the configured `MASTER_API_KEY` or `MASTER_PASSCODE` in the `x-apikey` header.

History records are soft-deleted by setting `is_deleted` to `1`; existing records default to `0`. For example:

```sh
curl -X PATCH "http://localhost:3000/api/internal/liquidity-swing-history/12" \
  -H "x-apikey: ${MASTER_API_KEY:-$MASTER_PASSCODE}" \
  -H "Content-Type: application/json" \
  -d '{"is_deleted":true}'
```

The history page's **Edit** action saves the manual analysis fields (`comment`, `is_traded`, `buy_price`, `sell_price`, `high`, `sl`, `c_low`, `qty`, and `p_l`) to the selected history row. Analysis edits use the same master key or passcode as delete/restore. Numeric analysis values are nullable until entered; `is_traded` defaults to false and `qty` is a non-negative integer.

Example:

```sh
curl "http://localhost:3000/api/fyers/market-data/historical-data?symbol=NSE%3ASBIN-EQ&resolution=D&date_format=0&range_from=1690895316&range_to=1691068173"
```

The historical chart supports Fyers 1-, 3-, and 5-minute candles, with quick interval buttons that immediately load the selected dataset. Chart display and bar replay use the same selected dataset. The bottom volume pane can be toggled on or off independently. When the loaded date range ends today, the chart also subscribes to Fyers market data over a server-side WebSocket proxy and aggregates ticks into live candles; Fyers credentials stay on the server. On Vercel, `api/[...path].js` serves Express REST routes and `api/live-chart.js` exposes the WebSocket proxy; enable Fluid Compute for projects that do not already have it. The browser reconnects automatically when a WebSocket closes. A candle-close countdown follows the selected interval and pauses during replay. Live updates also pause during replay, and exiting replay reloads the chart and reconnects. Choose **Pick start**, drag across the chart to position the replay marker, then click **Done** and **Start**. Replay reveals one bar at a time from that position. At 1×, playback advances one bar per second. The chart uses the locally served Lightweight Charts bundle at `/vendor/lightweight-charts.js`.

The chart includes internal and swing order blocks (latest 7 zones each by default) and liquidity-swing high and low levels (pivot lookback 5 by default), with volume labels. These indicators are based on LuxAlgo's Smart Money Concepts and Liquidity Swings logic and are licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); use is noncommercial and adaptations must be shared under the same license.

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

Swing results with a pivot time are saved to the automatically created `auto_trade_liquidity_swing_history` table. A unique key of option symbol, side, resolution, pivot lookback, and `pivot_time` allows one active row per swing; repeated results with the same key are ignored, even if other swing values later change. Results without a pivot time are not saved. Existing rows receive a `pivot_time` backfilled from `swing_json`. If existing rows have duplicate active keys, soft-delete all but one row; history reads and deletion actions remain available, and the unique index is created after active duplicates are resolved. Soft-deleted rows remain available with `includeDeleted=1`. Any existing `auto_trade_liquidity_swing_state` rows are migrated into the history table before the old state table is removed. The response's `step2.persistence` reports inserted and ignored results. Ensure the Turso credentials are configured before calling this endpoint.

This LuxAlgo-based adaptation is licensed CC BY-NC-SA 4.0 and is for noncommercial use with attribution and share-alike terms: https://creativecommons.org/licenses/by-nc-sa/4.0/
