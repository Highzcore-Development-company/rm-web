import type { BotTrade } from "@/lib/workspace/types";

/**
 * Trading profit and loss on the master account, by date.
 *
 * NOT REVENUE. This is the money the strategy made or lost on the master
 * account, which belongs to the investors whose accounts mirror it. Our income
 * is the $20 subscription, and the performance fee is configured in Vantage's
 * MAM panel and paid out by Vantage — it never reaches us. Nothing here may
 * ever be added to a revenue figure. See lib/admin/liquidity.ts.
 *
 * NET OF COSTS, always. commission and swap are stored negative and are added,
 * not subtracted. They are 0.00 on every Deriv trade, which makes this look
 * like a detail that does not matter — on Vantage Raw ECN it is about $6 a lot
 * (P2-705), so a gross figure would read too good on the exact numbers an
 * admin uses to judge the strategy.
 */

export type DayPnl = {
  /** YYYY-MM-DD, UTC. */
  date: string;
  net: number;
  wins: number;
  losses: number;
  trades: number;
};

export type MonthPnl = {
  /** YYYY-MM, UTC. */
  month: string;
  net: number;
  trades: number;
  wins: number;
  losses: number;
  days: DayPnl[];
};

export type TradingPnl = {
  months: MonthPnl[];
  net: number;
  trades: number;
  wins: number;
  losses: number;
  /** Gross profit over gross loss. Null when nothing has lost yet. */
  profitFactor: number | null;
  best: DayPnl | null;
  worst: DayPnl | null;
};

/** Result after costs. commission and swap are stored negative. */
export function netOf(trade: BotTrade): number {
  return (trade.pnl ?? 0) + (trade.commission ?? 0) + (trade.swap ?? 0);
}

const EMPTY: TradingPnl = {
  months: [],
  net: 0,
  trades: 0,
  wins: 0,
  losses: 0,
  profitFactor: null,
  best: null,
  worst: null,
};

/**
 * Pure, so it can be tested without rm-server.
 *
 * UTC throughout. A trade's day is the day it CLOSED, because that is when the
 * result existed — a position opened on Friday and closed on Monday is
 * Monday's result, and splitting it across both would double-count it.
 */
export function tradingPnlFrom(trades: BotTrade[]): TradingPnl {
  const closed = trades.filter((t) => t.close_ts);
  if (closed.length === 0) return EMPTY;

  const byDay = new Map<string, DayPnl>();

  for (const trade of closed) {
    const ts = Date.parse(trade.close_ts as string);
    if (Number.isNaN(ts)) continue;

    const date = new Date(ts).toISOString().slice(0, 10);
    const net = netOf(trade);

    const day = byDay.get(date) ?? {
      date,
      net: 0,
      wins: 0,
      losses: 0,
      trades: 0,
    };
    day.net += net;
    day.trades += 1;
    // A scratch trade — exactly zero after costs — is neither, and counting it
    // as a win would flatter the figure.
    if (net > 0) day.wins += 1;
    else if (net < 0) day.losses += 1;
    byDay.set(date, day);
  }

  const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (days.length === 0) return EMPTY;

  const byMonth = new Map<string, MonthPnl>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    const row = byMonth.get(month) ?? {
      month,
      net: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      days: [],
    };
    row.net += day.net;
    row.trades += day.trades;
    row.wins += day.wins;
    row.losses += day.losses;
    row.days.push(day);
    byMonth.set(month, row);
  }

  let grossWin = 0;
  let grossLoss = 0;
  for (const trade of closed) {
    const net = netOf(trade);
    if (net > 0) grossWin += net;
    else grossLoss += Math.abs(net);
  }

  const totals = days.reduce(
    (acc, d) => ({
      net: acc.net + d.net,
      trades: acc.trades + d.trades,
      wins: acc.wins + d.wins,
      losses: acc.losses + d.losses,
    }),
    { net: 0, trades: 0, wins: 0, losses: 0 },
  );

  return {
    // Newest month first: an admin opens this to see how it is going now.
    months: [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1)),
    ...totals,
    // Null rather than Infinity when nothing has lost yet. "∞" on a dashboard
    // reads as a bug, and dividing by zero to get it is one.
    profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
    best: days.reduce((a, b) => (b.net > a.net ? b : a)),
    worst: days.reduce((a, b) => (b.net < a.net ? b : a)),
  };
}
