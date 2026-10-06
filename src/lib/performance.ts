/**
 * Performance feed (E4).
 *
 * The real source is the bot's equity snapshots in Supabase, which are known to
 * stop writing silently for 24h+ (P2-704, Victor). Until that is fixed, every
 * getter returns null and every surface renders its unavailable state.
 *
 * Deliberate: a headline figure that is stale or zero is worse than no figure.
 * Callers must handle null — do not default to 0.
 */

export type PerformanceSummary = {
  /** Total return as a fraction, e.g. 0.095 for +9.5%. */
  totalReturn: number;
  /** Max drawdown as a positive fraction, e.g. 0.12 for -12%. */
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
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
  /** Result in R multiples. Signed. */
  resultR: number;
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
 * Sample data, so the page can be built and reviewed before the feed exists.
 *
 * Gated on NODE_ENV so it can never reach production — and the page labels it
 * loudly when it is on. A sample equity curve on a public performance page
 * would be an invented track record, which is the single worst thing this
 * product could publish.
 */
const SHOW_SAMPLE = process.env.NODE_ENV === "development";

export const IS_SAMPLE_DATA = SHOW_SAMPLE;

/** Deterministic pseudo-random so the sample does not change every reload. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function sampleEquity(): EquityPoint[] {
  const rand = seeded(42);
  const points: EquityPoint[] = [];
  let equity = 10_000;
  const start = Date.UTC(2026, 0, 1);

  for (let day = 0; day < 240; day += 1) {
    // Mild upward drift with real drawdowns — a straight line would make the
    // chart look like a lie even as a placeholder.
    equity *= 1 + (rand() - 0.46) * 0.012;
    points.push({
      t: new Date(start + day * 86_400_000).toISOString().slice(0, 10),
      equity: Math.round(equity),
    });
  }
  return points;
}

function sampleMonthly(points: EquityPoint[]): MonthlyReturn[] {
  const byMonth = new Map<string, EquityPoint[]>();
  for (const p of points) {
    const m = p.t.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), p]);
  }
  return [...byMonth.entries()].map(([month, ps]) => ({
    month,
    ret: ps[ps.length - 1].equity / ps[0].equity - 1,
  }));
}

function sampleTrades(): PublicTrade[] {
  const rand = seeded(7);
  const markets = ["EURUSD+", "GBPJPY+", "BTCUSD", "USDCAD+", "ETHUSD", "AUDUSD+"];
  return Array.from({ length: 24 }, (_, i) => {
    const r = (rand() - 0.42) * 3;
    return {
      id: `sample-${i}`,
      market: markets[i % markets.length],
      side: rand() > 0.5 ? ("buy" as const) : ("sell" as const),
      durationHours: Math.round(rand() * 40) + 1,
      resultR: Math.round(r * 10) / 10,
      closedAt: new Date(Date.UTC(2026, 7, 20) - i * 7_200_000).toISOString(),
    };
  });
}

export async function getPerformanceSummary(): Promise<PerformanceSummary | null> {
  // TODO(E4): read from Supabase once P2-704 lands and the feed is reliable.
  if (!SHOW_SAMPLE) return null;

  const points = sampleEquity();
  const first = points[0].equity;
  const last = points[points.length - 1].equity;

  let peak = first;
  let maxDd = 0;
  for (const p of points) {
    peak = Math.max(peak, p.equity);
    maxDd = Math.max(maxDd, 1 - p.equity / peak);
  }

  const trades = sampleTrades();
  const wins = trades.filter((t) => t.resultR > 0);
  const grossWin = wins.reduce((a, t) => a + t.resultR, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.resultR < 0).reduce((a, t) => a + t.resultR, 0),
  );

  return {
    totalReturn: last / first - 1,
    maxDrawdown: maxDd,
    winRate: wins.length / trades.length,
    profitFactor: grossLoss === 0 ? grossWin : grossWin / grossLoss,
    tradeCount: trades.length,
    monthsLive: sampleMonthly(points).length,
    asOf: new Date().toISOString(),
  };
}

export async function getEquityCurve(): Promise<EquityPoint[] | null> {
  return SHOW_SAMPLE ? sampleEquity() : null;
}

export async function getMonthlyReturns(): Promise<MonthlyReturn[] | null> {
  return SHOW_SAMPLE ? sampleMonthly(sampleEquity()) : null;
}

export async function getRecentTrades(): Promise<PublicTrade[] | null> {
  return SHOW_SAMPLE ? sampleTrades() : null;
}
