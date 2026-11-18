import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";

let client;

export function getTursoClient() {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("Missing required environment variable: TURSO_DATABASE_URL");
  }
  if (typeof authToken !== "string" || authToken.trim() === "") {
    throw new Error("Missing required environment variable: TURSO_AUTH_TOKEN");
  }

  client = createClient({ url, authToken });
  return client;
}

export async function persistNiftyOptionChain({ call, put }, dbClient) {
  const statements = [
    {
      sql: `
        INSERT INTO nifty_option_chain_ce (id, symbol, token, volume)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          symbol = excluded.symbol,
          token = excluded.token,
          volume = excluded.volume,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `,
      args: [call.symbol, call.token, call.volume],
    },
    {
      sql: `
        INSERT INTO nifty_option_chain_pe (id, symbol, token, volume)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          symbol = excluded.symbol,
          token = excluded.token,
          volume = excluded.volume,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `,
      args: [put.symbol, put.token, put.volume],
    },
  ];

  await dbClient.batch(statements, "write");
}

export async function persistSwingAnalyses(analyses, dbClient) {
  const scanId = randomUUID();
  const statements = analyses.map(
    ({ optionSide, symbol, token, optionVolume, interval, pivotLookback, bars, swing }) => ({
      sql: `
        INSERT INTO liquidity_swing_results (
          scan_id,
          option_side,
          symbol,
          token,
          option_volume,
          interval,
          pivot_lookback,
          bars,
          swing_found,
          swing_level,
          zone_bottom,
          zone_top,
          pivot_time,
          confirmed_at,
          touch_count,
          touch_volume,
          swing_status,
          broken_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        scanId,
        optionSide,
        symbol ?? null,
        token,
        optionVolume ?? null,
        interval,
        pivotLookback,
        bars,
        swing ? 1 : 0,
        swing?.level ?? null,
        swing?.zoneBottom ?? null,
        swing?.zoneTop ?? null,
        swing?.pivotTime ?? null,
        swing?.confirmedAt ?? null,
        swing?.intersectionCount ?? null,
        swing?.intersectionVolume ?? null,
        swing?.status ?? "not-found",
        swing?.brokenAt ?? null,
      ],
    }),
  );

  const results = await dbClient.batch(
    statements.map((statement) => ({
      ...statement,
      sql: `${statement.sql.trimEnd()} ON CONFLICT DO NOTHING`,
    })),
    "write",
  );
  const insertedRows = results.reduce((count, result) => count + result.rowsAffected, 0);
  return { scanId, insertedRows };
}

export async function isSwingOrderProcessedDb(
  dbClient,
  { tradingSymbol, triggerPrice, pivotTime, optionSide, strategyKey },
) {
  if (!dbClient || typeof dbClient.execute !== "function") return false;
  const key = strategyKey || `nifty_5_1m_${(optionSide || "").toLowerCase()}`;
  const result = await dbClient.execute({
    sql: `
      SELECT id FROM active_swing_orders
      WHERE strategy_key = ? AND trading_symbol = ? AND trigger_price = ? AND pivot_time = ?
      LIMIT 1
    `,
    args: [key, tradingSymbol || "", Number(triggerPrice) || 0, pivotTime || ""],
  });
  return result.rows.length > 0;
}

export async function getActiveSwingOrdersByStrategyKeyDb(dbClient, strategyKey) {
  if (!dbClient || typeof dbClient.execute !== "function") return [];
  const result = await dbClient.execute({
    sql: `
      SELECT strategy_key AS strategyKey, option_side AS optionSide, trading_symbol AS tradingSymbol, order_number AS nOrdNo,
             trigger_price AS triggerPrice, pivot_time AS pivotTime, status
      FROM active_swing_orders
      WHERE strategy_key = ? AND status = 'ACTIVE'
      ORDER BY id DESC
    `,
    args: [strategyKey],
  });
  return result.rows;
}

export async function getActiveSwingOrdersBySideDb(dbClient, optionSide) {
  if (!dbClient || typeof dbClient.execute !== "function") return [];
  const key = `nifty_5_1m_${(optionSide || "").toLowerCase()}`;
  return getActiveSwingOrdersByStrategyKeyDb(dbClient, key);
}

export async function recordActiveSwingOrderDb(
  dbClient,
  { strategyKey, optionSide, tradingSymbol, triggerPrice, pivotTime, orderNumber },
) {
  if (!dbClient || typeof dbClient.execute !== "function") return;
  const key = strategyKey || `nifty_5_1m_${(optionSide || "").toLowerCase()}`;
  await dbClient.execute({
    sql: `
      INSERT INTO active_swing_orders (strategy_key, option_side, trading_symbol, order_number, trigger_price, pivot_time, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
      ON CONFLICT(order_number) DO UPDATE SET
        strategy_key = excluded.strategy_key,
        status = 'ACTIVE',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `,
    args: [
      key,
      optionSide,
      tradingSymbol,
      String(orderNumber),
      Number(triggerPrice) || 0,
      pivotTime || "",
    ],
  });
}

export async function markSwingOrderCancelledDb(dbClient, orderNumber) {
  if (!dbClient || typeof dbClient.execute !== "function") return;
  await dbClient.execute({
    sql: `
      UPDATE active_swing_orders
      SET status = 'CANCELLED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE order_number = ?
    `,
    args: [String(orderNumber)],
  });
}
