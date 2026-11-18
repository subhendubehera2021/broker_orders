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

CREATE TABLE IF NOT EXISTS nifty_option_chain_ce (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  symbol TEXT NOT NULL,
  token TEXT NOT NULL,
  volume REAL NOT NULL CHECK (volume >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS nifty_option_chain_pe (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  symbol TEXT NOT NULL,
  token TEXT NOT NULL,
  volume REAL NOT NULL CHECK (volume >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS active_swing_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_key TEXT NOT NULL,
  option_side TEXT NOT NULL CHECK (option_side IN ('CALL', 'PUT')),
  trading_symbol TEXT NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  trigger_price REAL NOT NULL,
  pivot_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'EXECUTED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_swing_orders_sig
  ON active_swing_orders (strategy_key, trading_symbol, trigger_price, pivot_time);

CREATE INDEX IF NOT EXISTS idx_active_swing_orders_strategy_status
  ON active_swing_orders (strategy_key, status);
