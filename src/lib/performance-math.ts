import type {
  EquityPoint,
  MonthlyReturn,
  PerformanceSummary,
  PublicTrade,
} from "./performance";

/**
 * The arithmetic of the public record (E4).
 *
 * Raw rows from the bot go in, a publishable bundle or a named problem comes
 * out. Pure on purpose: no database, no clock except the one passed in, so
 * every figure on the performance page can be reproduced in a test and every
 * way the record could lie has a case that proves it refuses to.
 *
 * The rule throughout: if the data cannot be trusted, say nothing. A problem
 * is returned, the caller shows the unavailable state, and nobody sees a
 * number we could not stand behind. Never a default, never a guess.
 *
 * What we do not have is a deposit ledger. The bot's snapshots carry no cash
 * flows, so the record is only honest while the account has had no money put
 * in or taken out since its start. `feedHealth` enforces that by reconciling
 * every change in balance against the trades that closed in between.
 */

export type RawSnapshot = {
  ts: string;
  balance: number;
  equity: number;
};

export type RawTrade = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  open_ts: string;
  close_ts: string;
  open_price: number;
  close_price: number | null;
  sl: number | null;
  pnl: number | null;
  commission: number | null;
  swap: number | null;
  r_multiple: number | null;
};

/**
 * Why the record is not being published. `too_few_snapshots` also covers
 * rows that cannot be read and an opening balance that is not positive: in
 * each the starting point of the record is not known.
 */
export type FeedProblem =
  | "too_few_snapshots"
  | "too_few_trades"
  | "cash_flow"
  | "gap"
  | "trade_after_snapshot";

export type PerformanceBundle = {
  summary: PerformanceSummary;
  equity: EquityPoint[];
  monthly: MonthlyReturn[];
  trades: PublicTrade[];
};

export type ComputeOptions = {
  now: number;
  minTrades?: number;
  /** The bot's own re-baseline (`cutover_at`). Absent: the first snapshot. */
  start?: string | null;
};

/** Below this the figures are noise, and a win rate of 100% on 4 trades is an advert. */
export const MIN_PUBLIC_TRADES = 30;
/** The bot is known to stop writing snapshots silently (P2-704). */
export const MAX_SNAPSHOT_GAP_MS = 24 * 60 * 60 * 1000;
/** A close later than the last snapshot by more than this means snapshots stopped. */
export const TRADE_AFTER_SNAPSHOT_MS = 60 * 60 * 1000;
/** How far a balance may move without a trade explaining it: 2%, or 1 unit if larger. */
export const CASH_FLOW_TOLERANCE = 0.02;
export const RECENT_TRADES = 25;

const HOUR_MS = 60 * 60 * 1000;

/** Result after costs. Commission and swap are stored negative. */
export function netResult(t: RawTrade): number {
  return (t.pnl ?? 0) + (t.commission ?? 0) + (t.swap ?? 0);
}

/** YYYY-MM in UTC, whatever offset the timestamp was written with. */
export function monthKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 7);
}

/** Worst peak-to-trough fall as a positive fraction. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return worst;
}

/**
 * Whether the snapshots and trades can be published together. Expects both
 * sorted ascending by time and already cut to the record's start.
 */
export function feedHealth(
  snapshots: RawSnapshot[],
  trades: RawTrade[],
): FeedProblem | null {
  if (snapshots.length === 0) return null;

  for (let i = 1; i < snapshots.length; i += 1) {
    const gap = Date.parse(snapshots[i].ts) - Date.parse(snapshots[i - 1].ts);
    if (gap > MAX_SNAPSHOT_GAP_MS) return "gap";
  }

  const last = Date.parse(snapshots[snapshots.length - 1].ts);
  if (
    trades.some(
      (t) => Date.parse(t.close_ts) > last + TRADE_AFTER_SNAPSHOT_MS,
    )
  ) {
    return "trade_after_snapshot";
  }

  // Trades closed up to the first snapshot belong to the opening balance, so
  // the walk starts after them. Trades after the last snapshot are in no
  // interval; the check above has already bounded how late they can be.
  let next = 0;
  const first = Date.parse(snapshots[0].ts);
  while (next < trades.length && Date.parse(trades[next].close_ts) <= first) {
    next += 1;
  }
  for (let i = 1; i < snapshots.length; i += 1) {
    const prev = snapshots[i - 1];
    const cur = snapshots[i];
    const curTs = Date.parse(cur.ts);
    let explained = 0;
    while (next < trades.length && Date.parse(trades[next].close_ts) <= curTs) {
      explained += netResult(trades[next]);
      next += 1;
    }
    const unexplained = cur.balance - prev.balance - explained;
    if (Math.abs(unexplained) > Math.max(1, CASH_FLOW_TOLERANCE * prev.balance)) {
      return "cash_flow";
    }
  }

  return null;
}

function byTime<T>(rows: T[], time: (row: T) => number): T[] {
  return [...rows].sort((a, b) => time(a) - time(b));
}

function readable(snapshots: RawSnapshot[], trades: RawTrade[]): boolean {
  return (
    snapshots.every(
      (s) =>
        Number.isFinite(Date.parse(s.ts)) &&
        Number.isFinite(s.balance) &&
        Number.isFinite(s.equity),
    ) &&
    trades.every(
      (t) =>
        Number.isFinite(Date.parse(t.close_ts)) &&
        Number.isFinite(Date.parse(t.open_ts)) &&
        Number.isFinite(netResult(t)),
    )
  );
}

export function computePerformance(
  snapshots: RawSnapshot[],
  trades: RawTrade[],
  opts: ComputeOptions,
): { ok: true; bundle: PerformanceBundle } | { ok: false; problem: FeedProblem } {
  const minTrades = opts.minTrades ?? MIN_PUBLIC_TRADES;

  if (!readable(snapshots, trades)) {
    return { ok: false, problem: "too_few_snapshots" };
  }

  const orderedSnapshots = byTime(snapshots, (s) => Date.parse(s.ts));
  if (orderedSnapshots.length === 0) {
    return { ok: false, problem: "too_few_snapshots" };
  }

  // The record starts where the bot says, or at its first snapshot. Nothing
  // earlier is ours to count.
  const startIso = opts.start ?? orderedSnapshots[0].ts;
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) {
    return { ok: false, problem: "too_few_snapshots" };
  }
  const snaps = orderedSnapshots.filter((s) => Date.parse(s.ts) >= startMs);
  const closed = byTime(
    trades.filter((t) => Date.parse(t.close_ts) >= startMs),
    (t) => Date.parse(t.close_ts),
  );

  if (snaps.length < 2) return { ok: false, problem: "too_few_snapshots" };
  if (closed.length < minTrades) return { ok: false, problem: "too_few_trades" };

  const problem = feedHealth(snaps, closed);
  if (problem) return { ok: false, problem };

  // A close dated after "now" cannot be placed in any month; refusing is
  // better than a total return that quietly leaves it out.
  if (closed.some((t) => Date.parse(t.close_ts) > opts.now)) {
    return { ok: false, problem: "trade_after_snapshot" };
  }

  // Opening balance: the first snapshot, less whatever had already closed.
  const first = snaps[0];
  const beforeFirst = closed.filter(
    (t) => Date.parse(t.close_ts) <= Date.parse(first.ts),
  );
  const b0 = first.balance - beforeFirst.reduce((s, t) => s + netResult(t), 0);
  if (!(b0 > 0)) return { ok: false, problem: "too_few_snapshots" };

  // Realised balance after each trade, and the balance before it.
  const balanceBefore: number[] = [];
  const realised: number[] = [b0];
  let running = b0;
  for (const t of closed) {
    balanceBefore.push(running);
    running += netResult(t);
    realised.push(running);
  }
  if (!realised.every((b) => b > 0)) {
    return { ok: false, problem: "too_few_snapshots" };
  }

  // Monthly: every UTC month from the start to now, quiet ones included.
  const months: string[] = [];
  const d = new Date(startMs);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  for (; d.getTime() <= opts.now; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push(d.toISOString().slice(0, 7));
  }
  const netByMonth = new Map<string, number>();
  for (const t of closed) {
    const key = monthKey(t.close_ts);
    netByMonth.set(key, (netByMonth.get(key) ?? 0) + netResult(t));
  }
  let balance = b0;
  const monthly: MonthlyReturn[] = months.map((month) => {
    const net = netByMonth.get(month) ?? 0;
    const ret = net / balance;
    balance += net;
    return { month, ret };
  });
  const totalReturn = balance / b0 - 1;

  const nets = closed.map(netResult);
  const grossWin = nets.filter((n) => n > 0).reduce((s, n) => s + n, 0);
  const grossLoss = Math.abs(nets.filter((n) => n < 0).reduce((s, n) => s + n, 0));

  const lastSnapshot = snaps[snaps.length - 1];
  const summary: PerformanceSummary = {
    totalReturn,
    maxDrawdown: Math.max(
      maxDrawdown(snaps.map((s) => s.equity)),
      maxDrawdown(realised),
    ),
    winRate: nets.filter((n) => n > 0).length / closed.length,
    profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
    tradeCount: closed.length,
    monthsLive: monthly.length,
    asOf: lastSnapshot.ts,
  };

  // One point a day: the last snapshot of that UTC day.
  const byDay = new Map<string, number>();
  for (const s of snaps) {
    byDay.set(new Date(s.ts).toISOString().slice(0, 10), s.equity);
  }
  const equity: EquityPoint[] = [...byDay.entries()].map(([t, value]) => ({
    t,
    equity: Math.round(value),
  }));

  // Newest first. Market, side, duration, result: no size, no balance (P2-404).
  const recent: PublicTrade[] = closed
    .map((t, i) => {
      const dir = t.side === "buy" ? 1 : -1;
      const risk = t.sl === null ? 0 : Math.abs(t.open_price - t.sl);
      const resultR =
        t.r_multiple ??
        (risk > 0 && t.close_price !== null
          ? ((t.close_price - t.open_price) * dir) / risk
          : null);
      const held = Date.parse(t.close_ts) - Date.parse(t.open_ts);
      return {
        id: t.id,
        market: t.symbol,
        side: t.side,
        durationHours: Math.round((held / HOUR_MS) * 10) / 10,
        resultR,
        resultPct: netResult(t) / balanceBefore[i],
        closedAt: t.close_ts,
      };
    })
    .slice(-RECENT_TRADES)
    .reverse();

  return { ok: true, bundle: { summary, equity, monthly, trades: recent } };
}
