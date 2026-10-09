import { describe, expect, it } from "vitest";
import {
  computePerformance,
  feedHealth,
  maxDrawdown,
  MIN_PUBLIC_TRADES,
  monthKey,
  netResult,
  type FeedProblem,
  type RawSnapshot,
  type RawTrade,
} from "./performance-math";

// A fixed "now", so the months a record spans never depend on the day the
// tests are run.
const NOW = Date.parse("2026-03-05T12:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T = Date.parse("2026-02-01T00:00:00Z");

const iso = (ms: number) => new Date(ms).toISOString();

function snap(ts: string, balance: number, equity = balance): RawSnapshot {
  return { ts, balance, equity };
}

let nextId = 0;
function trade(over: Partial<RawTrade> & { close_ts: string }): RawTrade {
  nextId += 1;
  return {
    id: `t${nextId}`,
    symbol: "EURUSD",
    side: "buy",
    open_ts: iso(Date.parse(over.close_ts) - HOUR),
    open_price: 1.1,
    close_price: 1.1,
    sl: null,
    pnl: 0,
    commission: null,
    swap: null,
    r_multiple: null,
    ...over,
  };
}

/**
 * Daily snapshots whose balance is exactly the opening balance plus what has
 * closed by then, so the cash-flow reconciliation has nothing to find. A
 * helper rather than literals, so no test has to list a snapshot per day by
 * hand.
 */
function ledger(
  from: number,
  days: number,
  trades: RawTrade[],
  b0 = 10_000,
): RawSnapshot[] {
  return Array.from({ length: days + 1 }, (_, i) => {
    const ts = from + i * DAY;
    const closed = trades
      .filter((t) => Date.parse(t.close_ts) <= ts)
      .reduce((s, t) => s + netResult(t), 0);
    return snap(iso(ts), b0 + closed);
  });
}

/** One trade a day at noon, starting the day after T, with these nets. */
function tradesWithNets(nets: number[]): RawTrade[] {
  return nets.map((pnl, i) =>
    trade({ close_ts: iso(T + i * DAY + 12 * HOUR), pnl }),
  );
}

function run(nets: number[], minTrades = 1) {
  const trades = tradesWithNets(nets);
  return computePerformance(ledger(T, nets.length + 1, trades), trades, {
    now: NOW,
    minTrades,
  });
}

/** An empty trade just before the first snapshot, so a test about the
 * snapshots has the one trade the floor asks for and nothing to reconcile. */
function anchor(at: number): RawTrade {
  return trade({ close_ts: iso(at), pnl: 0 });
}

function bundleOf(result: ReturnType<typeof computePerformance>) {
  if (!result.ok) throw new Error(`expected a bundle, got ${result.problem}`);
  return result.bundle;
}

describe("maxDrawdown", () => {
  it("measures the worst fall from a running peak", () => {
    expect(maxDrawdown([100, 120, 90, 130, 65, 100])).toBe(0.5);
  });

  it("is zero for a series that only rises, or for no series", () => {
    expect(maxDrawdown([100, 110, 120])).toBe(0);
    expect(maxDrawdown([])).toBe(0);
  });
});

describe("netResult", () => {
  it("takes commission and swap off the profit", () => {
    expect(
      netResult(
        trade({
          close_ts: "2026-02-02T00:00:00Z",
          pnl: 100,
          commission: -6,
          swap: -1,
        }),
      ),
    ).toBe(93);
  });
});

describe("monthKey", () => {
  it("is the UTC month, however the timestamp was written", () => {
    expect(monthKey("2026-01-31T23:30:00Z")).toBe("2026-01");
    expect(monthKey("2026-02-01T00:30:00+02:00")).toBe("2026-01");
  });
});

describe("the monthly chain", () => {
  it("compounds from the opening balance and lists the quiet months", () => {
    const jan = Date.parse("2026-01-01T00:00:00Z");
    const trades = [
      trade({ close_ts: "2026-01-10T12:00:00Z", pnl: 500 }),
      trade({ close_ts: "2026-01-20T12:00:00Z", pnl: -200 }),
      trade({ close_ts: "2026-03-02T12:00:00Z", pnl: 1030 }),
    ];
    const { summary, monthly } = bundleOf(
      computePerformance(ledger(jan, 62, trades), trades, {
        now: NOW,
        minTrades: 1,
      }),
    );

    expect(monthly.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(monthly[0].ret).toBeCloseTo(0.03, 10);
    expect(monthly[1].ret).toBe(0);
    expect(monthly[2].ret).toBeCloseTo(0.1, 10);
    expect(summary.totalReturn).toBeCloseTo(0.133, 10);
    expect(summary.monthsLive).toBe(3);
    expect(summary.tradeCount).toBe(3);
  });
});

describe("cash flows", () => {
  const start = iso(T - HOUR);

  it("refuses a record whose balance moved with no trade to explain it", () => {
    const snaps = [snap(iso(T), 10_000), snap(iso(T + HOUR), 15_000)];
    const result = computePerformance(snaps, [anchor(T - 30 * 60_000)], {
      now: NOW,
      minTrades: 1,
      start,
    });
    expect(result).toEqual({ ok: false, problem: "cash_flow" });
  });

  it("accepts a balance move that a closed trade accounts for", () => {
    const snaps = [snap(iso(T), 10_000), snap(iso(T + HOUR), 10_100)];
    const trades = [
      anchor(T - 30 * 60_000),
      trade({ close_ts: iso(T + 30 * 60_000), pnl: 100 }),
    ];
    const result = computePerformance(snaps, trades, {
      now: NOW,
      minTrades: 1,
      start,
    });
    expect(result.ok).toBe(true);
  });
});

describe("win rate and profit factor", () => {
  it("keeps break-even trades in the denominator", () => {
    const { summary } = bundleOf(run([10, 0, -5]));
    expect(summary.winRate).toBeCloseTo(1 / 3, 10);
    expect(summary.profitFactor).toBe(2);
    expect(summary.tradeCount).toBe(3);
  });

  it("has no profit factor, rather than an infinite one, when nothing has lost", () => {
    const { summary } = bundleOf(run([10, 5]));
    expect(summary.profitFactor).toBeNull();
    expect(summary.winRate).toBe(1);
  });
});

describe("the sample floor", () => {
  it("is one closed trade: nothing from none, something from one", () => {
    expect(MIN_PUBLIC_TRADES).toBe(1);
    expect(computePerformance(ledger(T, 2, []), [], { now: NOW })).toEqual({
      ok: false,
      problem: "too_few_trades",
    });
    const one = tradesWithNets([10]);
    expect(
      computePerformance(ledger(T, 2, one), one, { now: NOW }).ok,
    ).toBe(true);
  });

  it("never publishes with no closed trade, even when asked for none", () => {
    expect(
      computePerformance(ledger(T, 2, []), [], { now: NOW, minTrades: 0 }),
    ).toEqual({ ok: false, problem: "too_few_trades" });
  });

  it("still refuses 29 trades when asked for 30", () => {
    const wins = (n: number) => Array.from({ length: n }, () => 10);
    expect(run(wins(29), 30)).toEqual({ ok: false, problem: "too_few_trades" });
    expect(run(wins(30), 30).ok).toBe(true);
  });
});

describe("the feed's health", () => {
  const start = iso(T - HOUR);

  const holed = [
    snap(iso(T), 10_000),
    snap(iso(T + HOUR), 10_000),
    snap(iso(T + 31 * HOUR), 10_000),
  ];
  const opts = { now: NOW, minTrades: 1, start };

  it("refuses a record with a close inside a day-long hole in the snapshots", () => {
    const trades = [
      anchor(T - 30 * 60_000),
      trade({ close_ts: iso(T + 10 * HOUR), pnl: 0 }),
    ];
    expect(computePerformance(holed, trades, opts)).toEqual({
      ok: false,
      problem: "gap",
    });
  });

  it("accepts a quiet day with nothing closed inside it", () => {
    expect(
      computePerformance(holed, [anchor(T - 30 * 60_000)], opts).ok,
    ).toBe(true);
  });

  it("allows a close up to an hour before the snapshot that ends a long hole", () => {
    const closeAt = (minutesBefore: number) => [
      anchor(T - 30 * 60_000),
      trade({ close_ts: iso(T + 31 * HOUR - minutesBefore * 60_000), pnl: 0 }),
    ];
    expect(computePerformance(holed, closeAt(59), opts).ok).toBe(true);
    expect(computePerformance(holed, closeAt(61), opts)).toEqual({
      ok: false,
      problem: "gap",
    });
  });

  it("recognises the P2-704 signature: trades closing long after the last snapshot", () => {
    const snaps = [snap(iso(T - HOUR), 10_000), snap(iso(T), 10_000)];
    const late = (after: number) => [
      anchor(T - 30 * 60_000),
      trade({ close_ts: iso(T + after), pnl: 0 }),
    ];
    const opts = { now: NOW, minTrades: 1, start: iso(T - 2 * HOUR) };

    expect(computePerformance(snaps, late(2 * HOUR), opts)).toEqual({
      ok: false,
      problem: "trade_after_snapshot",
    });
    expect(computePerformance(snaps, late(30 * 60_000), opts).ok).toBe(true);
  });

  it("reports healthy snapshots and trades as no problem", () => {
    expect(feedHealth([snap(iso(T), 1), snap(iso(T + HOUR), 1)], [])).toBeNull();
  });

  it("names every way a record can be refused", () => {
    const problems = new Set<FeedProblem>();
    const note = (r: ReturnType<typeof computePerformance>) => {
      if (!r.ok) problems.add(r.problem);
    };
    note(computePerformance([snap(iso(T), 10_000)], [], { now: NOW, minTrades: 0 }));
    note(run([10], 2));
    note(
      computePerformance(
        [snap(iso(T), 10_000), snap(iso(T + HOUR), 15_000)],
        [anchor(T - HOUR)],
        { now: NOW, minTrades: 1, start: iso(T - 2 * HOUR) },
      ),
    );
    note(
      computePerformance(
        [snap(iso(T), 10_000), snap(iso(T + 2 * DAY), 10_000)],
        [anchor(T - HOUR), trade({ close_ts: iso(T + 12 * HOUR), pnl: 0 })],
        { now: NOW, minTrades: 1, start: iso(T - 2 * HOUR) },
      ),
    );
    note(
      computePerformance(
        [snap(iso(T), 10_000), snap(iso(T + HOUR), 10_000)],
        [anchor(T - HOUR), trade({ close_ts: iso(T + 3 * HOUR) })],
        { now: NOW, minTrades: 1, start: iso(T - 2 * HOUR) },
      ),
    );
    const pair = [snap(iso(T), 10_000), snap(iso(T + HOUR), 10_000)];
    note(
      computePerformance(pair, [anchor(T - HOUR)], {
        now: NOW,
        minTrades: 1,
        start: "not a date",
      }),
    );
    note(
      computePerformance([snap(iso(T), NaN), pair[1]], [anchor(T - HOUR)], {
        now: NOW,
        minTrades: 1,
      }),
    );
    note(
      computePerformance(
        [snap(iso(T), 0), snap(iso(T + HOUR), 0)],
        [anchor(T - HOUR)],
        { now: NOW, minTrades: 1, start: iso(T - 2 * HOUR) },
      ),
    );
    note(
      computePerformance(
        [snap(iso(NOW - HOUR), 10_000), snap(iso(NOW + HOUR), 10_000)],
        [anchor(NOW - 90 * 60_000), trade({ close_ts: iso(NOW + 30 * 60_000) })],
        { now: NOW, minTrades: 1, start: iso(NOW - 2 * HOUR) },
      ),
    );
    expect([...problems].sort()).toEqual(
      [
        "cash_flow",
        "gap",
        "invalid_data",
        "invalid_start",
        "non_positive_balance",
        "too_few_snapshots",
        "too_few_trades",
        "trade_after_snapshot",
        "trade_in_future",
      ].sort(),
    );
  });

  it("says which unreadable thing it is, not that snapshots are missing", () => {
    const snaps = [snap(iso(T), 10_000), snap(iso(T + HOUR), 10_000)];
    const trades = [anchor(T - HOUR)];
    expect(
      computePerformance(snaps, trades, {
        now: NOW,
        minTrades: 1,
        start: "not a date",
      }),
    ).toEqual({ ok: false, problem: "invalid_start" });
    expect(
      computePerformance([snap(iso(T), NaN), snap(iso(T + HOUR), 10_000)], trades, {
        now: NOW,
        minTrades: 1,
      }),
    ).toEqual({ ok: false, problem: "invalid_data" });
  });

  it("refuses an opening balance that is not above zero", () => {
    const snaps = [snap(iso(T), 0), snap(iso(T + HOUR), 0)];
    expect(
      computePerformance(snaps, [anchor(T - HOUR)], {
        now: NOW,
        minTrades: 1,
        start: iso(T - 2 * HOUR),
      }),
    ).toEqual({ ok: false, problem: "non_positive_balance" });
  });

  it("refuses a record whose realised balance reaches zero along the way", () => {
    const snaps = [snap(iso(T), 10_000), snap(iso(T + 2 * HOUR), 0)];
    const trades = [
      anchor(T - HOUR),
      trade({ close_ts: iso(T + HOUR), pnl: -10_000 }),
    ];
    expect(
      computePerformance(snaps, trades, {
        now: NOW,
        minTrades: 1,
        start: iso(T - 2 * HOUR),
      }),
    ).toEqual({ ok: false, problem: "non_positive_balance" });
  });

  it("refuses a trade that closed after the clock we were given", () => {
    const snaps = [snap(iso(NOW - HOUR), 10_000), snap(iso(NOW + HOUR), 10_000)];
    const trades = [
      anchor(NOW - 90 * 60_000),
      trade({ close_ts: iso(NOW + 30 * 60_000), pnl: 0 }),
    ];
    expect(
      computePerformance(snaps, trades, {
        now: NOW,
        minTrades: 1,
        start: iso(NOW - 2 * HOUR),
      }),
    ).toEqual({ ok: false, problem: "trade_in_future" });
  });
});

describe("the trades list", () => {
  it("measures a trade in R from its stop, unless the bot recorded one", () => {
    const trades = [
      trade({
        close_ts: iso(T + 12 * HOUR),
        pnl: 50,
        side: "buy",
        open_price: 1.1,
        sl: 1.095,
        close_price: 1.11,
      }),
      trade({ close_ts: iso(T + DAY + 12 * HOUR), pnl: 10, sl: 1.095, r_multiple: 1.7 }),
      trade({ close_ts: iso(T + 2 * DAY + 12 * HOUR), pnl: 10, sl: null }),
    ];
    const { trades: rows } = bundleOf(
      computePerformance(ledger(T, 4, trades), trades, { now: NOW, minTrades: 1 }),
    );

    // Newest first.
    expect(rows[2].resultR).toBeCloseTo(2, 8);
    expect(rows[1].resultR).toBe(1.7);
    expect(rows[0].resultR).toBeNull();
  });

  it("expresses the result as a fraction of the balance before the trade", () => {
    const trades = [
      trade({ close_ts: iso(T + 12 * HOUR), pnl: 100 }),
      trade({ close_ts: iso(T + DAY + 12 * HOUR), pnl: -101 }),
    ];
    const { trades: rows } = bundleOf(
      computePerformance(ledger(T, 3, trades), trades, { now: NOW, minTrades: 1 }),
    );
    expect(rows[1].resultPct).toBeCloseTo(0.01, 10);
    expect(rows[0].resultPct).toBeCloseTo(-101 / 10_100, 10);
  });

  it("publishes market, side, duration and result, and nothing that sizes the account", () => {
    const trades = [trade({ close_ts: iso(T + 12 * HOUR), pnl: 10 })];
    const { trades: rows } = bundleOf(
      computePerformance(ledger(T, 2, trades), trades, { now: NOW, minTrades: 1 }),
    );
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        "closedAt",
        "durationHours",
        "id",
        "market",
        "resultPct",
        "resultR",
        "side",
      ].sort(),
    );
    expect(rows[0].durationHours).toBe(1);
  });

  it("keeps only the latest 25", () => {
    const { trades } = bundleOf(run(Array.from({ length: 28 }, () => 1)));
    expect(trades).toHaveLength(25);
  });
});

describe("the equity curve", () => {
  it("keeps the last snapshot of each UTC day", () => {
    const day = Date.parse("2026-01-02T00:00:00Z");
    const snaps = [
      snap(iso(day + HOUR), 10_000, 1),
      snap(iso(day + 2 * HOUR), 10_000, 2),
      snap(iso(day + 3 * HOUR), 10_000, 3),
    ];
    const { equity } = bundleOf(
      computePerformance(snaps, [anchor(day)], {
        now: NOW,
        minTrades: 1,
        start: iso(day),
      }),
    );
    expect(equity).toEqual([{ t: "2026-01-02", equity: 3 }]);
  });
});

describe("the opening balance", () => {
  const start = iso(T - DAY);

  it("is rebuilt from the first snapshot less what had already closed", () => {
    const trades = [trade({ close_ts: iso(T - HOUR), pnl: 100 })];
    const snaps = [snap(iso(T), 10_100), snap(iso(T + HOUR), 10_100)];
    const { summary } = bundleOf(
      computePerformance(snaps, trades, { now: NOW, minTrades: 1, start }),
    );
    expect(summary.totalReturn).toBeCloseTo(0.01, 10);
  });

  it("leaves out trades from before the start, in the count and in the balance", () => {
    const trades = [
      trade({ close_ts: iso(T - 10 * DAY), pnl: 500 }),
      trade({ close_ts: iso(T + 12 * HOUR), pnl: 100 }),
    ];
    const snaps = [
      snap(iso(T - DAY), 9_500),
      snap(iso(T), 10_000),
      snap(iso(T + DAY), 10_100),
    ];
    const { summary } = bundleOf(
      computePerformance(snaps, trades, {
        now: NOW,
        minTrades: 1,
        start: iso(T),
      }),
    );
    expect(summary.tradeCount).toBe(1);
    expect(summary.totalReturn).toBeCloseTo(0.01, 10);
  });

  it("counts, with no cutover, a trade that closed just before the first snapshot", () => {
    // The bot writes a snapshot right after a close, so the first snapshot's
    // balance already includes this trade.
    const first = T + 10 * DAY;
    const trades = [trade({ close_ts: iso(first - 230), pnl: 100 })];
    const snaps = [snap(iso(first), 10_100), snap(iso(first + HOUR), 10_100)];
    const { summary, trades: rows } = bundleOf(
      computePerformance(snaps, trades, { now: NOW }),
    );
    expect(summary.tradeCount).toBe(1);
    expect(summary.totalReturn).toBeCloseTo(0.01, 10);
    expect(rows[0].resultPct).toBeCloseTo(0.01, 10);
  });

  it("starts the monthly list at the month of the first trade when that is earlier", () => {
    const first = Date.parse("2026-02-10T00:00:00Z");
    const trades = [trade({ close_ts: "2026-01-25T12:00:00Z", pnl: 100 })];
    const snaps = [snap(iso(first), 10_100), snap(iso(first + HOUR), 10_100)];
    const { monthly, summary } = bundleOf(
      computePerformance(snaps, trades, { now: NOW }),
    );
    expect(monthly.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(monthly[0].ret).toBeCloseTo(0.01, 10);
    expect(summary.monthsLive).toBe(3);
  });

  it("is not published from a single snapshot", () => {
    expect(
      computePerformance([snap(iso(T), 10_000)], [anchor(T)], {
        now: NOW,
        minTrades: 1,
      }),
    ).toEqual({ ok: false, problem: "too_few_snapshots" });
  });
});

describe("max drawdown", () => {
  it("is read from equity, so a loss that is still open counts", () => {
    const snaps = [
      snap(iso(T), 10_000, 10_000),
      snap(iso(T + HOUR), 10_000, 9_000),
      snap(iso(T + 2 * HOUR), 10_000, 10_000),
    ];
    const { summary } = bundleOf(
      computePerformance(snaps, [anchor(T - HOUR)], {
        now: NOW,
        minTrades: 1,
        start: iso(T - 2 * HOUR),
      }),
    );
    expect(summary.maxDrawdown).toBeCloseTo(0.1, 10);
  });
});
