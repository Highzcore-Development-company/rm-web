import { describe, expect, it } from "vitest";
import { netOf, tradingPnlFrom } from "@/lib/admin/trading-pnl";
import type { BotTrade } from "@/lib/workspace/types";

/**
 * The costs are the point of these tests.
 *
 * commission and swap are 0.00 on every Deriv trade, so a gross calculation
 * looks correct today and starts lying the moment the bot moves to Vantage Raw
 * ECN, where it is about $6 a lot (P2-705). A test is how that stays true.
 */

function trade(over: Partial<BotTrade> & { close_ts: string | null }): BotTrade {
  return {
    id: `${over.close_ts}-${over.pnl ?? 0}-${over.symbol ?? "X"}`,
    ticket: null,
    symbol: "EURUSD+",
    timeframe: null,
    strategy: null,
    side: "buy",
    volume: 1,
    open_ts: "2026-06-01T00:00:00Z",
    open_price: 1,
    close_price: 1,
    sl: null,
    tp: null,
    pnl: 0,
    commission: 0,
    swap: 0,
    entry_spread: null,
    close_reason: null,
    is_dry_run: false,
    entry_snapshot: null,
    exit_snapshot: null,
    entry_trend: null,
    exit_trend: null,
    entry_htf_trend: null,
    exit_htf_trend: null,
    trend_agreement: null,
    ...over,
  } as BotTrade;
}

describe("netOf", () => {
  it("subtracts commission and swap, which are stored negative", () => {
    expect(
      netOf(trade({ close_ts: "2026-06-02T10:00:00Z", pnl: 100, commission: -6, swap: -2 })),
    ).toBe(92);
  });

  it("turns a small gross win into a real loss once costs are in", () => {
    // The case that matters on Raw ECN and cannot happen on Deriv.
    expect(
      netOf(trade({ close_ts: "2026-06-02T10:00:00Z", pnl: 4, commission: -6 })),
    ).toBe(-2);
  });
});

describe("tradingPnlFrom", () => {
  it("is empty when nothing has closed", () => {
    const r = tradingPnlFrom([trade({ close_ts: null, pnl: 50 })]);
    expect(r.trades).toBe(0);
    expect(r.net).toBe(0);
    expect(r.profitFactor).toBeNull();
  });

  it("counts a trade on the day it CLOSED, not the day it opened", () => {
    const r = tradingPnlFrom([
      trade({
        open_ts: "2026-06-05T20:00:00Z",
        close_ts: "2026-06-08T09:00:00Z",
        pnl: 30,
      }),
    ]);
    expect(r.months[0].days[0].date).toBe("2026-06-08");
  });

  it("groups by day and month, newest first", () => {
    const r = tradingPnlFrom([
      trade({ close_ts: "2026-05-02T10:00:00Z", pnl: 10 }),
      trade({ close_ts: "2026-06-02T10:00:00Z", pnl: 20 }),
      trade({ close_ts: "2026-06-02T15:00:00Z", pnl: -5 }),
    ]);

    expect(r.months.map((m) => m.month)).toEqual(["2026-06", "2026-05"]);
    expect(r.months[0].net).toBe(15);
    expect(r.months[0].trades).toBe(2);
    expect(r.net).toBe(25);
  });

  it("nets costs into the daily figure", () => {
    const r = tradingPnlFrom([
      trade({ close_ts: "2026-06-02T10:00:00Z", pnl: 100, commission: -6, swap: -2 }),
      trade({ close_ts: "2026-06-02T11:00:00Z", pnl: 50, commission: -6 }),
    ]);
    expect(r.net).toBe(136);
  });

  it("does not count a scratch trade as a win or a loss", () => {
    const r = tradingPnlFrom([
      trade({ close_ts: "2026-06-02T10:00:00Z", pnl: 6, commission: -6 }),
    ]);
    expect(r.trades).toBe(1);
    expect(r.wins).toBe(0);
    expect(r.losses).toBe(0);
  });

  it("returns null profit factor rather than Infinity when nothing has lost", () => {
    const r = tradingPnlFrom([
      trade({ close_ts: "2026-06-02T10:00:00Z", pnl: 40 }),
    ]);
    expect(r.profitFactor).toBeNull();
  });

  it("reports best and worst day by net result", () => {
    const r = tradingPnlFrom([
      trade({ close_ts: "2026-06-01T10:00:00Z", pnl: 80 }),
      trade({ close_ts: "2026-06-02T10:00:00Z", pnl: -40 }),
      trade({ close_ts: "2026-06-03T10:00:00Z", pnl: 10 }),
    ]);
    expect(r.best?.date).toBe("2026-06-01");
    expect(r.worst?.date).toBe("2026-06-02");
  });
});
