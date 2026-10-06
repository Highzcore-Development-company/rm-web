import { createRmServerClient } from "@/lib/supabase/rm-server";

/**
 * P2-503 / P2-504 — what the bot has open, and what it has closed.
 *
 * Reads rm-server, the bot's project. Table and column names below were taken
 * from the bot's own schema (trading_bot/db/schema.sql), not guessed.
 *
 * MIRRORED, NOT PER-ACCOUNT. The bot trades a master and the MAM copies to each
 * investor proportionally. What we can honestly show is the master's positions,
 * labelled as such. Presenting them as "your positions" would imply we had read
 * the investor's account, which we have not — and the sizes would be wrong for
 * them anyway.
 *
 * NOTE ON COLUMNS: bot_v_open_positions exposes `volume` (lot size). We never
 * select it. Lot size plus a result lets anyone infer the master's account
 * size, and from that every investor's allocation. Same reason P2-404 is
 * anonymised.
 */

export type LivePosition = {
  ticket: number;
  symbol: string;
  side: string;
  openedAt: string;
  openPrice: number;
  /** Postgres interval, as returned. Formatted for display, not arithmetic. */
  age: string | null;
};

export type ClosedTrade = {
  ticket: number;
  symbol: string;
  side: string;
  openedAt: string | null;
  closedAt: string | null;
  profit: number | null;
};

/**
 * The bot marks paper trades. Showing them beside real ones on an investor's
 * dashboard would misrepresent what has actually happened to money, so they
 * are excluded everywhere.
 */
const LIVE_ONLY = { column: "is_dry_run", value: false } as const;

/**
 * PostgREST's code for "no such table". On rm-server that means the bot has
 * not been migrated onto it yet — a known state, not a fault. Reporting it as
 * an error makes the dev overlay cry wolf until a real error is lost in the
 * noise. Anything else IS a fault and stays loud.
 */
function reportReadFailure(
  which: string,
  error: { code?: string; message: string },
) {
  if (error.code === "PGRST205") {
    console.info(
      `[positions] ${which}: rm-server has no data yet — showing the unavailable state.`,
    );
    return;
  }
  console.error(`[positions] ${which} read failed:`, error.message);
}

export async function getLivePositions(): Promise<LivePosition[] | null> {
  const client = createRmServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("bot_v_open_positions")
    // Deliberately not `volume`. See the note above.
    .select("ticket, symbol, side, open_ts, open_price, age")
    .eq(LIVE_ONLY.column, LIVE_ONLY.value)
    .order("open_ts", { ascending: false })
    .limit(50);

  if (error) {
    // Logged, not thrown: a dashboard that 500s because one panel cannot load
    // is worse than one with a panel saying it cannot load.
    reportReadFailure("live", error);
    return null;
  }

  return (data ?? []).map((r) => ({
    ticket: r.ticket as number,
    symbol: r.symbol as string,
    side: r.side as string,
    openedAt: r.open_ts as string,
    openPrice: r.open_price as number,
    age: (r.age as string | null) ?? null,
  }));
}

export async function getClosedTrades(): Promise<ClosedTrade[] | null> {
  const client = createRmServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("bot_trades")
    .select("ticket, symbol, side, open_ts, close_ts, profit")
    .eq(LIVE_ONLY.column, LIVE_ONLY.value)
    .not("close_ts", "is", null)
    .order("close_ts", { ascending: false })
    .limit(50);

  if (error) {
    reportReadFailure("closed", error);
    return null;
  }

  return (data ?? []).map((r) => ({
    ticket: r.ticket as number,
    symbol: r.symbol as string,
    side: r.side as string,
    openedAt: (r.open_ts as string | null) ?? null,
    closedAt: (r.close_ts as string | null) ?? null,
    profit: (r.profit as number | null) ?? null,
  }));
}
