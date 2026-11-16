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
