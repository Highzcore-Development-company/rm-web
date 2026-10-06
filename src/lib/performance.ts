/**
 * Performance feed (E4).
 *
 * The real source is the bot's equity snapshots in Supabase, which are known to
 * stop writing silently for 24h+ (P2-704, Victor). Until that is fixed and the
 * table is confirmed trustworthy, this returns null and every surface renders
 * its unavailable state.
 *
 * Deliberate: a headline figure that is stale or zero is worse than no figure.
 * Callers must handle null — do not default to 0.
 */

export type PerformanceSummary = {
  /** Total return as a fraction, e.g. 0.095 for +9.5%. */
  totalReturn: number;
  /** Max drawdown as a positive fraction, e.g. 0.12 for -12%. */
  maxDrawdown: number;
  /** Win rate as a fraction. */
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  monthsLive: number;
  /** When the underlying snapshot was taken. Used to detect staleness. */
  asOf: string;
};

/** A feed older than this is treated as unavailable rather than shown. */
export const MAX_FEED_AGE_MS = 6 * 60 * 60 * 1000;

export function isStale(summary: PerformanceSummary, now = Date.now()): boolean {
  const asOf = Date.parse(summary.asOf);
  if (Number.isNaN(asOf)) return true;
  return now - asOf > MAX_FEED_AGE_MS;
}

export async function getPerformanceSummary(): Promise<PerformanceSummary | null> {
  // TODO(E4): read from Supabase once P2-704 lands and the feed is reliable.
  return null;
}
