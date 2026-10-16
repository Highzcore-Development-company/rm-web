/**
 * Performance feed (E4).
 *
 * The real source is the bot's equity snapshots and closed trades on rm-server,
 * read and computed in performance-feed.ts. The snapshots are known to stop
 * writing silently for 24h+ (P2-704, Victor), so the feed goes dark rather than
 * publish a record it cannot vouch for: a gap in the snapshots, trades closing
 * after the last one, or money moving that no trade explains all make every
 * getter return null, and every surface renders its unavailable state.
 *
 * Deliberate: a headline figure that is stale or zero is worse than no figure.
 * Callers must handle null — do not default to 0.
 */

import { cache } from "react";
import { loadPerformanceBundle } from "@/lib/performance-feed";

export type PerformanceSummary = {
  /** Total return as a fraction, e.g. 0.095 for +9.5%. */
  totalReturn: number;
  /** Max drawdown as a positive fraction, e.g. 0.12 for -12%. */
  maxDrawdown: number;
  winRate: number;
  /** Null when there has been no losing trade: the ratio is undefined, not infinite. */
  profitFactor: number | null;
  tradeCount: number;
  monthsLive: number;
  /** When the underlying snapshot was taken. Used to detect staleness. */
  asOf: string;
};

export type EquityPoint = {
  /** ISO date. */
  t: string;
  /** Account equity, in whole currency units. */
  equity: number;
};

export type MonthlyReturn = {
  /** YYYY-MM. */
  month: string;
  /** Fraction, signed. */
  ret: number;
};

/**
 * P2-404 — anonymised. Market, side, duration and result only. No lot sizes
 * and no balances: those would let someone infer the master's account size,
 * and with it every investor's allocation.
 */
export type PublicTrade = {
  id: string;
  market: string;
  side: "buy" | "sell";
  /** Hours held. */
  durationHours: number;
  /** Result in R multiples. Signed. Null when the trade had no stop to measure it against. */
  resultR: number | null;
  /** Net result as a fraction of the account before the trade. */
  resultPct: number;
  closedAt: string;
};

/** A feed older than this is treated as unavailable rather than shown. */
export const MAX_FEED_AGE_MS = 6 * 60 * 60 * 1000;

export function isStale(summary: PerformanceSummary, now = Date.now()): boolean {
  const asOf = Date.parse(summary.asOf);
  if (Number.isNaN(asOf)) return true;
  return now - asOf > MAX_FEED_AGE_MS;
}

/**
 * NO SAMPLE DATA. Removed 16 Oct 2026, Victor: "we shouldn't show sample
 * again, we are trading live account."
 *
 * There used to be a generated equity curve, monthly series and trade list,
 * gated on NODE_ENV, so the page could be built before the feed existed. It
 * had already caused the failure it was meant to avoid: because every getter
 * began `if (!SHOW_SAMPLE) return real`, sample did not fall back, it WON, and
 * the real feed was never read locally. The account went live and the site
 * kept publishing a generated 18.0% return and a 70.8% win rate under a banner.
 *
 * Making it a fallback fixed the override and was still the wrong shape: an
 * invented track record on a performance page is the single worst thing this
 * product can publish, and the only safe number of ways to produce one is
 * none. The page now shows the real record or its unavailable state. If the
 * figures are missing, that is a feed to fix, not a gap to fill.
 *
 * Callers must handle null — do not default to 0.
 */

/** One read per request, shared by the four getters below. */
const bundle = cache(() => loadPerformanceBundle());

export async function getPerformanceSummary(): Promise<PerformanceSummary | null> {
  // The real record, or null. performance-feed.ts is the source and
  // performance-math.ts holds the health rules that decide when it goes dark.
  return (await bundle())?.summary ?? null;
}

export async function getEquityCurve(): Promise<EquityPoint[] | null> {
  return (await bundle())?.equity ?? null;
}

export async function getMonthlyReturns(): Promise<MonthlyReturn[] | null> {
  return (await bundle())?.monthly ?? null;
}

export async function getRecentTrades(): Promise<PublicTrade[] | null> {
  return (await bundle())?.trades ?? null;
}
