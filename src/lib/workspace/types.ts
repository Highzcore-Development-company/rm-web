/**
 * The shape of the bot's data.
 *
 * Lifted verbatim from highzcore's `lib/admin/trading-bot-queries.ts`, types
 * only — the queries there read highzcore's own Supabase project with a
 * service role. rm-web reads rm-server instead, and as a signed-in investor
 * rather than an admin, so the fetching is ours; the shape is theirs.
 *
 * Kept identical on purpose. The workspace component is a straight port, and
 * the moment these drift the port stops compiling, which is the warning we
 * want rather than a silent mismatch at runtime.
 */

/** v7: three trend states only. htf_trend (H1) decides trades; entry_trend (M15)
 *  is context. `Sideways` = no trend. */
export type BotTrend = 'Uptrend' | 'Downtrend' | 'Sideways' | string;

export type BotState = 'monitoring' | 'ready' | 'active' | string;

/** Why the bot is in its current state — one of four fixed tags (v7). */
export type BotReason =
  | 'Awaiting Trend'
  | 'Pullback'
  | 'Entry ready'
  | 'Trend Confirmed'
  | string;

export interface BotMarket {
  symbol: string;
  alias: string;
  timeframe: string | null;
  htf: string | null;
  entry_trend: BotTrend | null;
  htf_trend: BotTrend | null;
  state: BotState | null;
  reason: BotReason | null;
  /** Latest signal, e.g. `BUY @ 1.15250`. Null when there is none. */
  latest_signal: string | null;
  price: number | null;
  level: number | null;
  pnl: number | null;
  /** Stop/target as the broker currently holds them — correct for adopted
   *  positions and after the profit lock ratchets the stop. Null when unset. */
  sl: number | null;
  tp: number | null;
  /** Lots the broker currently holds. Same reason as sl/tp: an adopted position
   *  has no bot_trades row, and a partial close changes the size. Null when flat. */
  volume: number | null;
  /** When the broker opened the live position — the clock for trade duration.
   *  Null when flat. */
  opened_at: string | null;
  strategy: string | null;
  is_dry_run: boolean;
  updated_at: string;
  /** What every indicator reads on this market right now (migration 012).
   *  Null until that migration is applied. This is the reading that decides
   *  whether a PENDING order should have been placed — the trade page's
   *  entry-vs-exit table only exists once a trade does. */
  snapshot: BotSnapshot | null;
  /** Ticket of whatever is live on this market — the resting order's, or the
   *  open position's. The same number across a fill in MT5, which is what lets
   *  an analyst's note survive the trigger. Null when the market is flat, and
   *  null everywhere until migration 007. */
  pending_ticket: number | null;
}

/** An analyst's reading of one order (bot_trade_analysis, migration 007).
 *  Written while the order is PENDING — that is when it is worth writing. */
export interface BotTradeAnalysis {
  ticket: number;
  symbol: string;
  note: string | null;
  image_path: string | null;
  /** 'keep' | 'close' — decided while the order was still pending. Null means
   *  nobody reached it before it filled (migration 016). */
  verdict: string | null;
  /** What the bot got wrong, in the analyst's words. */
  issue: string | null;
  /** What was changed about the bot because of it. An issue stays OPEN until
   *  this is written — that is the difference between noticing and doing. */
  fix: string | null;
  fixed_at: string | null;
  fixed_by: string | null;
  side: string | null;
  level: number | null;
  sl: number | null;
  tp: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** An analysis with its image already signed for display. */
export interface BotTradeAnalysisView extends BotTradeAnalysis {
  imageUrl: string | null;
}

export interface BotTrade {
  id: string;
  ticket: number | null;
  symbol: string;
  timeframe: string | null;
  strategy: string | null;
  side: 'buy' | 'sell' | string;
  volume: number;
  open_ts: string;
  open_price: number;
  close_ts: string | null;
  close_price: number | null;
  sl: number | null;
  tp: number | null;
  pnl: number | null;
  commission: number | null;
  swap: number | null;
  entry_spread: number | null;
  close_reason: string | null;
  is_dry_run: boolean;
  /** The trade review — what the indicators read at the entry bar and again at
   *  the exit bar. Written by the bot (db/migrations/005 in the bot repo); null
   *  on every trade that closed before that shipped, and not backfillable. */
  entry_snapshot: BotSnapshot | null;
  exit_snapshot: BotSnapshot | null;
  /** Trend as an integer, -2 (Strong Down) .. +2 (Strong Up). `htf` is the
   *  higher timeframe the bot confirms against — H1 when trading M15. */
  entry_trend: number | null;
  exit_trend: number | null;
  entry_htf_trend: number | null;
  exit_htf_trend: number | null;
  /** 'with trend' | 'against trend' | 'no trend', judged at entry. */
  trend_agreement: string | null;
  /** Best excursion in favour and worst against, in PRICE units, measured on
   *  bar extremes. mae is the one to lead with on a winner: "came within a hair
   *  of the stop" is the story the P&L column hides. */
  mfe: number | null;
  mae: number | null;
  /** Result as a multiple of the initial risk (entry → stop). */
  r_multiple: number | null;
}

/** One bar's indicator readings. Every value may be null where the terminal
 *  lacked the history to compute it — render those as "—", never as zero. */
export interface BotSnapshot {
  time: string | null;
  close: number | null;
  trend: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  macd: number | null;
  macd_hist: number | null;
  adx: number | null;
  plus_di: number | null;
  minus_di: number | null;
  atr: number | null;
  bb_z: number | null;
}

export interface BotBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface BotEquity {
  ts: string;
  balance: number;
  equity: number;
  margin: number | null;
  margin_free: number | null;
  open_positions: number;
  is_dry_run: boolean;
}

export interface BotPrediction {
  id: string;
  symbol: string;
  timeframe: string;
  ts: string;
  horizon_bars: number;
  direction: 'long' | 'short' | 'flat' | string;
  edge_bps: number | null;
  confidence: number | null;
  predicted_vol: number | null;
  acted_on: boolean;
  skip_reason: string | null;
  created_at: string;
}

export interface BotModelRun {
  id: string;
  symbol: string;
  model_type: string;
  timeframe: string | null;
  trained_at: string;
  oos_sharpe: number | null;
  oos_hit_rate: number | null;
  oos_profit_factor: number | null;
  oos_net_pnl: number | null;
  oos_max_dd_pct: number | null;
  n_oos_trades: number | null;
  buy_hold_pct: number | null;
  beats_buy_hold: boolean | null;
  passed_gate: boolean;
  gate_notes: string | null;
}

/** Admin-set lot sizing, one row per market (bot_symbol_config). */
export interface BotConfig {
  symbol: string;
  alias: string;
  lot_size: number | null; // null = broker minimum
  /** BACKEND_V9: close an open trade once its floating P&L reaches this many
   *  dollars. null = off, and the trade runs on its SL/TP and profit ladder. */
  close_at_profit: number | null;
  enabled: boolean;
  updated_at: string;
  /** Email of whoever last changed this market's settings (migration 017).
   *  Null for rows written before it. Last writer, not a log. */
  updated_by?: string | null;
  /** That email resolved against public.users — see BotSettings.updated_by_name
   *  for why this is looked up rather than stored. */
  updated_by_name?: string | null;
}

/** Broker contract limits used to validate a lot size (bot_symbols). */
export interface BotSymbolSpec {
  name: string;
  alias: string;
  digits: number;
  volume_min: number;
  volume_max: number;
  volume_step: number;
}

/** The trading switch (bot_settings, one row). Off = the bot opens nothing new;
 *  it keeps running and keeps managing everything already placed. */
export interface BotSettings {
  trading_enabled: boolean;
  /** True = the bot proposes and places nothing until a person approves
   *  (migration 015). False = it places its own orders, as it always has. */
  require_approval: boolean;
  updated_at: string;
  updated_by: string | null;
  /** `updated_by` is stored as the issuer's EMAIL (see issuer() in
   *  trading-bot-actions). This is that email resolved against public.users —
   *  "Victor Otung" rather than an address — and null when the row predates
   *  the email convention, or names nobody with an account. Resolved in
   *  getBotOverview, never stored: a name that was copied at write time would
   *  go stale the day someone is renamed. */
  updated_by_name?: string | null;
  /** Trades before this date are the OLD strategy's record. Kept, not
   *  deleted — it is the evidence of what did not work — but filtered out of
   *  the dashboard by default so the new strategy is measured on its own.
   *  Null = no cutover set, show everything (migration 014). */
  cutover_at: string | null;
  /** When the bot last READ this flag (migration 013). Null means it never
   *  has — on older code, not running, or unable to reach Supabase. A switch
   *  that cannot be verified is worse than none, because you stop watching. */
  seen_by_bot_at: string | null;
}

/** A setup the bot wants to take, waiting on a person (migration 015).
 *  Nothing is at the broker while this is pending — that is the point. */
export interface BotProposal {
  id: string;
  symbol: string;
  alias: string | null;
  side: string;              // 'buy_limit' | 'sell_limit'
  level: number;
  sl: number | null;
  tp: number | null;
  rr: number | null;
  bar_time: string;
  snapshot: BotSnapshot | null;
  htf_trend: number | null;
  trend_agreement: string | null;
  status: string;            // pending | approved | placed | rejected | expired | missed
  created_at: string;
  /** Who answered it, and when. Null while it is still pending. */
  decided_by?: string | null;
  decided_at?: string | null;
  /** Broker ticket, once the trading loop has placed an approved proposal. */
  ticket?: number | null;
  /** Why it ended where it did — the rejecter's reason, or the bot's
   *  ("price had already reached the level when it was approved"). */
  note?: string | null;
}

export interface BotOverview {
  markets: BotMarket[];
  configs: BotConfig[];
  specs: BotSymbolSpec[];
  openTrades: BotTrade[];
  /** Most recent closed trades for the Transactions tab (client filters/sorts). */
  closedTrades: BotTrade[];
  /** True total closed-trade count (V2) — independent of the fetch limit above. */
  closedCount: number;
  equity: BotEquity | null;
  equityCurve: BotEquity[];
  /** Newest market write across all symbols — drives the online/stale badge. */
  lastUpdate: string | null;
  /** Setups waiting on a person. Empty unless approval mode is on. */
  proposals: BotProposal[];
  /** Analyst readings for the tickets currently live, keyed by ticket. Empty
   *  until migration 007. */
  analyses: Record<number, BotTradeAnalysisView>;
  /** The trading switch. Null when migration 006 has not been applied — the
   *  dashboard then hides the control rather than showing one the bot cannot
   *  read, which would be a button that silently does nothing. */
  settings: BotSettings | null;
}
