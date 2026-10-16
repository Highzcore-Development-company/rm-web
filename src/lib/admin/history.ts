import { createRmServerClient } from "@/lib/supabase/rm-server";
import { netOf } from "@/lib/admin/trading-pnl";
import type { BotTrade } from "@/lib/workspace/types";
import { rangeFor, type DateRange, type RangeKey } from "@/lib/admin/ranges";

/**
 * Trade history for the admin panel — ranged, sorted, paged, per market.
 *
 * PAGED IN THE DATABASE, not in memory. The obvious version reads every closed
 * trade and slices the array, which works at 138 trades and stops working
 * silently: the fetch limit truncates before the slice runs, so the page keeps
 * rendering, it is just the wrong page. `range()` and `count: exact` put the
 * window and the total in the same query, so "page 7 of 12" is answered by the
 * thing that produced the rows.
 *
 * The per-market summary is the exception and is deliberately a SEPARATE,
 * unpaged read: "how is EURUSD doing" cannot be answered from one page of
 * trades, and aggregating the page would produce a figure that changes when
 * somebody clicks Next. It is capped, and says so when it hits the cap.
 */

export const PER_PAGE = 25;

/** How many rows an outcome filter may scan before it stops being honest. */
const OUTCOME_SCAN_LIMIT = 20_000;

export type SortKey = "closed" | "opened" | "pnl" | "symbol" | "duration";
export type SortDir = "asc" | "desc";

/** Won, lost or scratched — judged on NET, so it cannot be a SQL filter. */
export type Outcome = "all" | "won" | "lost" | "scratch";

export type HistoryQuery = {
  range: RangeKey;
  from?: string | null;
  to?: string | null;
  /** Bot symbol, exactly as rm-server stores it. Null = every market. */
  symbol?: string | null;
  /** "buy" or "sell". Null = both. */
  side?: string | null;
  /** close_reason, exactly as the bot writes it. Null = every reason. */
  reason?: string | null;
  /** Filtered on net result, which means in memory — see below. */
  outcome?: Outcome;
  sort?: SortKey;
  dir?: SortDir;
  page?: number;
  perPage?: number;
};

export type HistoryRow = BotTrade & {
  /** P&L after commission and swap. The only figure that should be read. */
  net: number;
  /** Minutes held, or null when either end is missing. */
  heldMinutes: number | null;
};

export type HistoryTotals = {
  net: number;
  trades: number;
  wins: number;
  losses: number;
  /** Gross profit over gross loss; null when nothing has lost yet. */
  profitFactor: number | null;
};

export type HistoryPage = {
  rows: HistoryRow[];
  total: number;
  /** True when an outcome filter forced the in-memory path and hit its cap. */
  truncated?: boolean;
  page: number;
  perPage: number;
  pages: number;
  /** Totals for THE WHOLE RANGE, not this page. See below. */
  totals: HistoryTotals;
  /** False when rm-server is not configured — an empty table would otherwise
   *  read as "the bot did nothing in this range". */
  connected: boolean;
};

/** Which column each sort key orders on, rm-server side. */
const SORT_COLUMN: Record<SortKey, string> = {
  closed: "close_ts",
  opened: "open_ts",
  pnl: "pnl",
  symbol: "symbol",
  // No stored duration column, so this one is ordered after the fact. It is
  // the single exception and is marked as such where it happens.
  duration: "close_ts",
};

function heldMinutesOf(trade: BotTrade): number | null {
  if (!trade.open_ts || !trade.close_ts) return null;
  const ms =
    new Date(trade.close_ts).getTime() - new Date(trade.open_ts).getTime();
  return Number.isFinite(ms) ? Math.round(ms / 60_000) : null;
}

export function decorate(trade: BotTrade): HistoryRow {
  return { ...trade, net: netOf(trade), heldMinutes: heldMinutesOf(trade) };
}

/**
 * Applies a window to a closed-trade query.
 *
 * A closed trade's day is the day it CLOSED — same rule as trading-pnl.ts,
 * because that is when the result existed. A position opened Friday and closed
 * Monday is Monday's result.
 */
type Filterable = {
  gte: (column: string, value: string) => Filterable;
  lt: (column: string, value: string) => Filterable;
};

function withinRange<T>(query: T, window: DateRange): T {
  let q = query as Filterable;
  if (window.from) q = q.gte("close_ts", window.from);
  if (window.to) q = q.lt("close_ts", window.to);
  return q as T;
}

export async function getHistory(query: HistoryQuery): Promise<HistoryPage> {
  const perPage = query.perPage ?? PER_PAGE;
  const page = Math.max(query.page ?? 1, 1);
  const sort = query.sort ?? "closed";
  const dir = query.dir ?? "desc";

  const client = createRmServerClient();
  if (!client) {
    return {
      rows: [],
      total: 0,
      page,
      perPage,
      pages: 0,
      totals: { net: 0, trades: 0, wins: 0, losses: 0, profitFactor: null },
      connected: false,
    };
  }

  const window = rangeFor(query.range, new Date(), {
    from: query.from,
    to: query.to,
  });

  const offset = (page - 1) * perPage;

  /**
   * OUTCOME CANNOT BE A SQL FILTER, so asking for one changes the whole shape
   * of this function.
   *
   * Won and lost are judged on NET — pnl plus commission plus swap — and
   * PostgREST cannot compare an expression, only a column. Filtering on `pnl`
   * alone would be the easy wrong answer: a $1 gain that cost $1.50 in
   * commission is a loss, and classifying it as a win is exactly the mistake
   * totalsFor() is written to avoid. The two must not disagree on one screen.
   *
   * So when an outcome is asked for, the range is read in one go, filtered on
   * the real figure, and paged in memory. Capped, and the cap is reported.
   */
  const byOutcome = query.outcome && query.outcome !== "all";

  let rowsQuery = client
    .from("bot_trades")
    .select("*", { count: "exact" })
    .not("close_ts", "is", null);

  rowsQuery = withinRange(rowsQuery, window);
  if (query.symbol) rowsQuery = rowsQuery.eq("symbol", query.symbol);
  if (query.side) rowsQuery = rowsQuery.eq("side", query.side);
  if (query.reason) rowsQuery = rowsQuery.eq("close_reason", query.reason);

  const ordered = rowsQuery
    .order(SORT_COLUMN[sort], { ascending: dir === "asc" })
    // A stable tiebreaker. Without it, two trades that closed in the same
    // second can swap places between page 1 and page 2, so one is shown twice
    // and the other never — paging without a total order.
    .order("id", { ascending: true });

  const rowsPromise = byOutcome
    ? ordered.limit(OUTCOME_SCAN_LIMIT)
    : ordered.range(offset, offset + perPage - 1);

  // The range totals, as a SECOND query on purpose. The numbers above the
  // table describe the range; computing them from `rows` would make them
  // describe the page, so "net this week" would change on every Next click.
  let totalsQuery = client
    .from("bot_trades")
    .select("pnl, commission, swap")
    .not("close_ts", "is", null);
  totalsQuery = withinRange(totalsQuery, window);
  if (query.symbol) totalsQuery = totalsQuery.eq("symbol", query.symbol);
  if (query.side) totalsQuery = totalsQuery.eq("side", query.side);
  if (query.reason) totalsQuery = totalsQuery.eq("close_reason", query.reason);

  const [rowsResult, totalsResult] = await Promise.all([
    rowsPromise,
    totalsQuery.limit(20_000),
  ]);

  let rows = ((rowsResult.data ?? []) as BotTrade[]).map(decorate);
  let total = rowsResult.count ?? 0;
  let truncated = false;

  if (byOutcome) {
    const matched = rows.filter((row) =>
      query.outcome === "won"
        ? row.net > 0
        : query.outcome === "lost"
          ? row.net < 0
          : row.net === 0,
    );
    truncated = rows.length >= OUTCOME_SCAN_LIMIT;
    total = matched.length;
    rows = matched.slice(offset, offset + perPage);
  }

  // Duration is not a column, so it orders here, WITHIN the page. Said plainly
  // because it is a real limitation: sorting by duration orders the page you
  // are looking at, not the whole range. Better than refusing the sort, and
  // better than reading 20,000 rows to order them properly.
  if (sort === "duration") {
    rows.sort((a, b) => {
      const av = a.heldMinutes ?? -1;
      const bv = b.heldMinutes ?? -1;
      return dir === "asc" ? av - bv : bv - av;
    });
  }

  // The figures above the table describe the range as filtered. When an
  // outcome filter is on they come from the matched rows instead, so the
  // headline and the table are talking about the same set.
  const totals = byOutcome
    ? totalsFor(rows.length ? allMatched(rowsResult.data as BotTrade[], query.outcome!) : [])
    : totalsFor(
        (totalsResult.data ?? []) as Pick<BotTrade, "pnl" | "commission" | "swap">[],
      );

  return {
    rows,
    total,
    page,
    perPage,
    pages: Math.max(Math.ceil(total / perPage), 1),
    totals,
    truncated,
    connected: true,
  };
}

/** The whole matched set, for the totals when paging happens in memory. */
function allMatched(data: BotTrade[], outcome: Outcome): BotTrade[] {
  return (data ?? []).filter((trade) => {
    const net = netOf(trade);
    return outcome === "won" ? net > 0 : outcome === "lost" ? net < 0 : net === 0;
  });
}

/** Pure, so the arithmetic is tested without rm-server. */
export function totalsFor(
  trades: Pick<BotTrade, "pnl" | "commission" | "swap">[],
): HistoryTotals {
  let net = 0;
  let wins = 0;
  let losses = 0;
  let grossWin = 0;
  let grossLoss = 0;

  for (const trade of trades) {
    const value = netOf(trade as BotTrade);
    net += value;
    // Zero is neither. A scratch trade counts in `trades` and in neither
    // column, which is why wins + losses can be fewer than trades.
    if (value > 0) {
      wins += 1;
      grossWin += value;
    } else if (value < 0) {
      losses += 1;
      grossLoss += Math.abs(value);
    }
  }

  return {
    net,
    trades: trades.length,
    wins,
    losses,
    profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
  };
}

export type MarketPerformance = {
  symbol: string;
  net: number;
  trades: number;
  wins: number;
  losses: number;
  /** Wins over DECIDED trades. Null when nothing has been decided. */
  winRate: number | null;
  profitFactor: number | null;
  best: number;
  worst: number;
  lastClosedAt: string | null;
};

/** The cap on the per-market read. Reported, never hidden. */
const MARKET_SCAN_LIMIT = 20_000;

export type MarketBreakdown = {
  markets: MarketPerformance[];
  /** True when the scan hit its cap, so the figures describe the most recent
   *  MARKET_SCAN_LIMIT trades rather than everything in the range. */
  truncated: boolean;
  connected: boolean;
};

/**
 * Per-market performance over a range — Victor's "sort per market so I can see
 * the progress of each market, and their performance".
 */
export async function getMarketBreakdown(
  range: RangeKey,
  custom?: { from?: string | null; to?: string | null },
): Promise<MarketBreakdown> {
  const client = createRmServerClient();
  if (!client) return { markets: [], truncated: false, connected: false };

  const window = rangeFor(range, new Date(), custom);

  let query = client
    .from("bot_trades")
    .select("symbol, pnl, commission, swap, close_ts")
    .not("close_ts", "is", null)
    .order("close_ts", { ascending: false });
  query = withinRange(query, window);

  const { data } = await query.limit(MARKET_SCAN_LIMIT);
  const trades = (data ?? []) as BotTrade[];

  return {
    markets: breakdownOf(trades),
    truncated: trades.length >= MARKET_SCAN_LIMIT,
    connected: true,
  };
}

/**
 * Pure aggregation, newest-first input.
 *
 * Separated from the fetch so the arithmetic is testable, and because the
 * markets page needs the same shape from a list it already holds.
 */
export function breakdownOf(trades: BotTrade[]): MarketPerformance[] {
  const by = new Map<string, MarketPerformance>();
  const gross = new Map<string, { win: number; loss: number }>();

  for (const trade of trades) {
    const value = netOf(trade);
    const row = by.get(trade.symbol) ?? {
      symbol: trade.symbol,
      net: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      profitFactor: null,
      best: 0,
      worst: 0,
      lastClosedAt: null,
    };
    const g = gross.get(trade.symbol) ?? { win: 0, loss: 0 };

    row.net += value;
    row.trades += 1;
    if (value > 0) {
      row.wins += 1;
      g.win += value;
    } else if (value < 0) {
      row.losses += 1;
      g.loss += Math.abs(value);
    }
    row.best = Math.max(row.best, value);
    row.worst = Math.min(row.worst, value);
    // Input is newest-first, so the first one seen is the latest. `??=` rather
    // than `=`: a later row must not overwrite it with an older timestamp.
    row.lastClosedAt ??= trade.close_ts;

    by.set(trade.symbol, row);
    gross.set(trade.symbol, g);
  }

  const markets = [...by.values()].map((row) => {
    const g = gross.get(row.symbol) ?? { win: 0, loss: 0 };
    const decided = row.wins + row.losses;
    return {
      ...row,
      winRate: decided === 0 ? null : row.wins / decided,
      profitFactor: g.loss === 0 ? null : g.win / g.loss,
    };
  });

  // WORST FIRST. An admin opens this page to find what is losing money, and
  // ordering by net descending buries it under everything that is working.
  markets.sort((a, b) => a.net - b.net);

  return markets;
}
