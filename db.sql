CREATE TABLE IF NOT EXISTS liquidity_swing_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  option_side TEXT NOT NULL CHECK (option_side IN ('CALL', 'PUT')),
  symbol TEXT,
  token TEXT NOT NULL,
  option_volume REAL,
  interval TEXT NOT NULL,
  pivot_lookback INTEGER NOT NULL CHECK (pivot_lookback > 0),
  bars INTEGER NOT NULL CHECK (bars >= 0),
  swing_found INTEGER NOT NULL CHECK (swing_found IN (0, 1)),
  swing_level REAL,
  zone_bottom REAL,
  zone_top REAL,
  pivot_time TEXT,
  confirmed_at TEXT,
  touch_count INTEGER,
  touch_volume REAL,
  swing_status TEXT NOT NULL CHECK (
    swing_status IN ('not-found', 'tracking', 'qualified', 'broken')
  ),
  broken_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_liquidity_swing_identity
  ON liquidity_swing_results (
    COALESCE(symbol, ''),
    token,
    pivot_lookback,
    interval,
    COALESCE(pivot_time, '')
  );

CREATE INDEX IF NOT EXISTS idx_liquidity_swing_fetched_at
  ON liquidity_swing_results (fetched_at);

CREATE INDEX IF NOT EXISTS idx_liquidity_swing_token_fetched_at
  ON liquidity_swing_results (token, fetched_at);

-- For an existing table created before symbol and option_volume were added,
-- run these once only if those columns are missing:
-- ALTER TABLE liquidity_swing_results ADD COLUMN symbol TEXT;
-- ALTER TABLE liquidity_swing_results ADD COLUMN option_volume REAL;
-- Then run the CREATE UNIQUE INDEX above. Remove existing duplicates first if needed.
