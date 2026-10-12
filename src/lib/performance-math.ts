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
 * Why the record is not being published. One value per cause, so whoever is
 * looking at a blank page knows what to check.
 *
 * - `too_few_snapshots`: fewer than 2 snapshots since the start. Check that
 *   the bot is writing them and that `cutover_at` is not too recent.
 * - `too_few_trades`: no closed trade, or fewer than the floor. Check the
 *   trades table since the start.
 * - `invalid_start`: `cutover_at` is set but is not a date. Check its value.
 * - `invalid_data`: a timestamp, balance, equity or result is not a finite
 *   number. Check the rows the bot wrote.
 * - `non_positive_balance`: the opening balance, or the realised balance at
 *   any point in the record, is zero or below. Check the first snapshot and
 *   the trade results.
 * - `cash_flow`: a balance moved with no trade to explain it, so money was
 *   probably put in or taken out. Check for a deposit or withdrawal.
 * - `gap`: more than a day without snapshots while trades kept closing. Check
 *   that the bot was running.
 * - `trade_after_snapshot`: a trade closed more than an hour after the last
 *   snapshot. Check whether the bot stopped writing snapshots.
 * - `trade_in_future`: a trade closed after the clock we were given. Check
 *   the trade's `close_ts` and the server time.
 */
export type FeedProblem =
  | "too_few_snapshots"
  | "too_few_trades"
  | "invalid_start"
  | "invalid_data"
  | "non_positive_balance"
  | "cash_flow"
  | "gap"
  | "trade_after_snapshot"
  | "trade_in_future";

export type PerformanceBundle = {
  summary: PerformanceSummary;
  equity: EquityPoint[];
  monthly: MonthlyReturn[];
  trades: PublicTrade[];
};

export type ComputeOptions = {
  now: number;
  minTrades?: number;
  /**
   * The bot's own re-baseline (`cutover_at`). Absent: no cut at all, and every
   * live closed trade counts, including one that closed just before the first
   * snapshot (the bot writes a snapshot right after a close).
   */
  start?: string | null;
};

/**
 * Victor's ruling of 7 Oct 2026 is to show what is available, so the floor is
 * one closed trade. The disclosure beside the figures states the trade count,
 * which is what keeps a small sample honest. Zero trades still refuses.
 *
 * This floor only decides whether the page shows figures at all, per the
 * ruling above. It is not the 200 closed trades the brief asks for before
 * any external investor, so the page being live does not mean the record is
 * ready to sell on.
 */
export const MIN_PUBLIC_TRADES = 1;
/** A hole longer than this with a close inside it means snapshots stopped (P2-704). */
export const MAX_SNAPSHOT_GAP_MS = 24 * 60 * 60 * 1000;
/** A close later than the last snapshot by more than this means snapshots stopped. */
export const TRADE_AFTER_SNAPSHOT_MS = 60 * 60 * 1000;
/** How far a balance may move without a trade explaining it: 2%, or 1 unit if larger. */
export const CASH_FLOW_TOLERANCE = 0.02;
export const RECENT_TRADES = 25;
/**
 * The bot writes a snapshot right after each close, and the snapshot's own
 * timestamp can sit a fraction of a second before the `close_ts` of a close its
 * balance already includes (measured: up to about 0.2 s, and more when several
 * positions close together). Two seconds is far above that and far below the
 * time between trades.
 */
export const SNAPSHOT_GRACE_MS = 2000;
/**
 * Two consecutive snapshots closer than this are one burst of closes, as when
 * several positions close together, and are reconciled as a whole. Whoever sets
 * `cutover_at` should put it at least ten seconds clear of any close or
 * snapshot, not inside a burst.
 */
export const SNAPSHOT_CLUSTER_MS = 10_000;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Which snapshot a close belongs to: the first whose time is at or after the
 * close less SNAPSHOT_GRACE_MS, or -1 when the close is after the last one.
 * `snapshotMs` is ascending. The one rule for matching trades to snapshots, so
 * the cash-flow check and the opening balance cannot disagree.
 */
export function snapshotIndexFor(closeMs: number, snapshotMs: number[]): number {
  const from = closeMs - SNAPSHOT_GRACE_MS;
  let lo = 0;
  let hi = snapshotMs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (snapshotMs[mid] >= from) hi = mid;
    else lo = mid + 1;
  }
  return lo === snapshotMs.length ? -1 : lo;
}

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

  // A hole in the snapshots is the P2-704 signature only when trades went on
  // closing inside it: the bot writes a snapshot after each close, so a close
  // followed by no snapshot within TRADE_AFTER_SNAPSHOT_MS is a snapshot that
  // was never written. A quiet day with nothing closed is not a fault.
  for (let i = 1; i < snapshots.length; i += 1) {
    const prevTs = Date.parse(snapshots[i - 1].ts);
    const curTs = Date.parse(snapshots[i].ts);
    if (curTs - prevTs <= MAX_SNAPSHOT_GAP_MS) continue;
    const unrecorded = trades.some((t) => {
      const closeTs = Date.parse(t.close_ts);
      return (
        closeTs > prevTs + SNAPSHOT_GRACE_MS &&
        closeTs + TRADE_AFTER_SNAPSHOT_MS < curTs
      );
    });
    if (unrecorded) return "gap";
  }

  const last = Date.parse(snapshots[snapshots.length - 1].ts);
  if (
    trades.some(
      (t) => Date.parse(t.close_ts) > last + TRADE_AFTER_SNAPSHOT_MS,
    )
  ) {
    return "trade_after_snapshot";
  }

  // Each close is explained by the snapshot it belongs to. Those assigned to
  // the first snapshot are inside the opening balance, so they explain no
  // interval. Trades after the last snapshot are in no interval; the check
  // above has already bounded how late they can be.
  const snapshotMs = snapshots.map((s) => Date.parse(s.ts));
  const explainedBy: number[] = snapshots.map(() => 0);
  for (const t of trades) {
    const at = snapshotIndexFor(Date.parse(t.close_ts), snapshotMs);
    if (at >= 1) explainedBy[at] += netResult(t);
  }
  // Snapshots written within SNAPSHOT_CLUSTER_MS of each other belong to one
  // burst of closes; which of them first carried which close is not knowable
  // from the rows, but the last one carries them all, so reconcile the burst
  // as a whole against the snapshot before it.
  let base = snapshots[0];
  let explained = 0;
  for (let i = 1; i < snapshots.length; i += 1) {
    explained += explainedBy[i];
    const cur = snapshots[i];
    if (
      i + 1 < snapshots.length &&
      snapshotMs[i + 1] - snapshotMs[i] <= SNAPSHOT_CLUSTER_MS
    ) {
      continue;
    }
    const unexplained = cur.balance - base.balance - explained;
    if (Math.abs(unexplained) > Math.max(1, CASH_FLOW_TOLERANCE * base.balance)) {
      return "cash_flow";
    }
    base = cur;
    explained = 0;
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
  // Never below one: with no closed trade the win rate is 0/0.
  const minTrades = Math.max(1, opts.minTrades ?? MIN_PUBLIC_TRADES);

  if (!readable(snapshots, trades)) {
    return { ok: false, problem: "invalid_data" };
  }

  const orderedSnapshots = byTime(snapshots, (s) => Date.parse(s.ts));
  if (orderedSnapshots.length === 0) {
    return { ok: false, problem: "too_few_snapshots" };
  }

  // The record starts where the bot says. With no cutover there is no cut:
  // every live trade and snapshot counts, and the opening balance is walked
  // back from the first snapshot below.
  const startMs = opts.start ? Date.parse(opts.start) : null;
  if (startMs !== null && !Number.isFinite(startMs)) {
    return { ok: false, problem: "invalid_start" };
  }
  const snaps =
    startMs === null
      ? orderedSnapshots
      : orderedSnapshots.filter((s) => Date.parse(s.ts) >= startMs);
  const closed = byTime(
    startMs === null
      ? trades
      : trades.filter((t) => Date.parse(t.close_ts) >= startMs),
    (t) => Date.parse(t.close_ts),
  );

  if (snaps.length < 2) return { ok: false, problem: "too_few_snapshots" };
  if (closed.length < minTrades) return { ok: false, problem: "too_few_trades" };

  const problem = feedHealth(snaps, closed);
  if (problem) return { ok: false, problem };

  // A close dated after "now" cannot be placed in any month; refusing is
  // better than a total return that quietly leaves it out.
  if (closed.some((t) => Date.parse(t.close_ts) > opts.now)) {
    return { ok: false, problem: "trade_in_future" };
  }

  // Opening balance: the first snapshot, less whatever had already closed.
  const first = snaps[0];
  const snapshotMs = snaps.map((s) => Date.parse(s.ts));
  const beforeFirst = closed.filter(
    (t) => snapshotIndexFor(Date.parse(t.close_ts), snapshotMs) === 0,
  );
  const b0 = first.balance - beforeFirst.reduce((s, t) => s + netResult(t), 0);
  if (!(b0 > 0)) return { ok: false, problem: "non_positive_balance" };

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
    return { ok: false, problem: "non_positive_balance" };
  }

  // Monthly: every UTC month from the start to now, quiet ones included. With
  // no cutover the start is the earlier of the first snapshot and first trade.
  const months: string[] = [];
  const d = new Date(
    startMs ??
      Math.min(
        Date.parse(first.ts),
        ...closed.slice(0, 1).map((t) => Date.parse(t.close_ts)),
      ),
  );
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
