import "server-only";
import { unstable_cache } from "next/cache";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import {
  computePerformance,
  type PerformanceBundle,
  type RawSnapshot,
  type RawTrade,
} from "@/lib/performance-math";

/**
 * Where the public record comes from (E4): the bot's own rows on rm-server,
 * read once, turned into every figure by performance-math, cached for a few
 * minutes.
 *
 * Anything that goes wrong comes back as null: no client configured, a read
 * that fails, more rows than we are willing to page through, a value that is
 * not a number, a feed that fails its health checks (see feedHealth). The page
 * and the API already have an unavailable state; this is what feeds it. Nothing
 * here falls back to sample data. That path stays in performance.ts, and only
 * in development.
 *
 * Reads only. rm-server is the bot's project and we write nothing to it.
 */

/** Objects rm-server exposes to anon. Adjust here if the views get other names. */
const SNAPSHOT_SOURCE = "bot_equity_snapshots";
const TRADE_SOURCE = "bot_trades";
// Deliberately not volume, margin or anything else that sizes the account (P2-404).
const SNAPSHOT_COLUMNS = "ts, balance, equity, open_positions";
const TRADE_COLUMNS =
  "id, symbol, side, open_ts, close_ts, open_price, close_price, sl, pnl, commission, swap, r_multiple";
const PAGE = 1000;
const MAX_PAGES = 20;
export const REVALIDATE_SECONDS = 300;

type ReadError = { code?: string; message: string };
type Row = Record<string, unknown>;

/**
 * PostgREST's code for "no such table" means the bot has not been migrated onto
 * rm-server yet, which is a known state and not a fault (same call as
 * positions.ts). Anything else is a fault and stays loud.
 */
function report(which: string, error: ReadError) {
  if (error.code === "PGRST205") {
    console.info(
      `[performance] ${which}: rm-server has no data yet, showing the unavailable state.`,
    );
    return;
  }
  console.error(`[performance] ${which} read failed:`, error.message);
}

/**
 * Every page or nothing. A series with its tail cut off would publish a record
 * that stops short of the truth, so hitting the page limit is a refusal.
 */
async function readAll(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: ReadError | null }>,
  which: string,
): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) {
      report(which, error);
      return null;
    }
    const chunk = (data ?? []) as Row[];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
  console.error(
    `[performance] ${which}: more than ${MAX_PAGES * PAGE} rows; refusing to publish a truncated series.`,
  );
  return null;
}

// The columns are float8 here, but PostgREST sends `numeric` as a string, so
// coerce. A value that is not a finite number is a failed read, not a zero.
function required(value: unknown, field: string): number {
  const n = value === null || value === undefined ? NaN : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} is not a number`);
  return n;
}

function optional(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : required(value, field);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${field} is not text`);
  }
  return value;
}

function toSnapshot(row: Row): RawSnapshot {
  return {
    ts: text(row.ts, "snapshot ts"),
    balance: required(row.balance, "snapshot balance"),
    equity: required(row.equity, "snapshot equity"),
    open_positions: required(row.open_positions, "snapshot open_positions"),
  };
}

function toTrade(row: Row): RawTrade {
  if (row.side !== "buy" && row.side !== "sell") {
    throw new Error("trade side is not buy or sell");
  }
  return {
    id: text(row.id, "trade id"),
    symbol: text(row.symbol, "trade symbol"),
    side: row.side,
    open_ts: text(row.open_ts, "trade open_ts"),
    close_ts: text(row.close_ts, "trade close_ts"),
    open_price: required(row.open_price, "trade open_price"),
    close_price: optional(row.close_price, "trade close_price"),
    sl: optional(row.sl, "trade sl"),
    pnl: optional(row.pnl, "trade pnl"),
    commission: optional(row.commission, "trade commission"),
    swap: optional(row.swap, "trade swap"),
    r_multiple: optional(row.r_multiple, "trade r_multiple"),
  };
}

async function readBundle(): Promise<PerformanceBundle | null> {
  const client = createRmServerClient();
  if (!client) return null;

  // The bot's own re-baseline. The start comes from the bot, never the page.
  const { data: settings, error: settingsError } = await client
    .from("bot_settings")
    .select("cutover_at")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError) {
    report("settings", settingsError);
    return null;
  }
  const start = (settings?.cutover_at as string | null | undefined) ?? null;

  // Paper trades are never part of the record.
  const snapshotRows = await readAll((from, to) => {
    let q = client
      .from(SNAPSHOT_SOURCE)
      .select(SNAPSHOT_COLUMNS)
      .eq("is_dry_run", false)
      .order("ts", { ascending: true });
    if (start) q = q.gte("ts", start);
    return q.range(from, to);
  }, "snapshots");
  if (!snapshotRows) return null;

  const tradeRows = await readAll((from, to) => {
    let q = client
      .from(TRADE_SOURCE)
      .select(TRADE_COLUMNS)
      .eq("is_dry_run", false)
      .not("close_ts", "is", null)
      .order("close_ts", { ascending: true })
      // A tiebreak, so paging cannot skip or repeat trades that closed together.
      .order("id", { ascending: true });
    if (start) q = q.gte("close_ts", start);
    return q.range(from, to);
  }, "trades");
  if (!tradeRows) return null;

  const snapshots = snapshotRows.map(toSnapshot);
  const trades = tradeRows.map(toTrade);

  const result = computePerformance(snapshots, trades, {
    now: Date.now(),
    start,
  });
  if (!result.ok) {
    console.warn(`[performance] feed not publishable: ${result.problem}`);
    return null;
  }
  return result.bundle;
}

/** A network error or an unreadable row is logged and becomes the unavailable state. */
async function fetchBundle(): Promise<PerformanceBundle | null> {
  try {
    return await readBundle();
  } catch (error) {
    console.error(
      "[performance] read failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Cached for a few minutes: the snapshots move on the bot's schedule, not per
 * request. Nothing request-scoped (cookies, headers) may be read inside.
 */
export const loadPerformanceBundle = unstable_cache(
  fetchBundle,
  ["performance-bundle"],
  { revalidate: REVALIDATE_SECONDS, tags: ["performance"] },
);
