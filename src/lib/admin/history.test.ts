import { describe, expect, it } from "vitest";
import { breakdownOf, decorate, totalsFor } from "./history";
import type { BotTrade } from "@/lib/workspace/types";

function trade(partial: Partial<BotTrade>): BotTrade {
  return {
    symbol: "EURUSD+",
    pnl: 0,
    commission: 0,
    swap: 0,
    close_ts: "2026-10-16T10:00:00Z",
    ...partial,
  } as BotTrade;
}

describe("totalsFor", () => {
  it("is zero and undefined-free on nothing", () => {
    expect(totalsFor([])).toEqual({
      net: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      profitFactor: null,
    });
  });

  it("nets commission and swap off", () => {
    // Stored negative, so they are ADDED. On Vantage Raw ECN this is about $6
    // a lot — a gross figure reads materially better than the account does.
    const totals = totalsFor([trade({ pnl: 10, commission: -1.5, swap: -0.5 })]);
    expect(totals.net).toBeCloseTo(8, 10);
  });

  it("counts a scratch trade in neither win nor loss", () => {
    // Which is why wins + losses can be fewer than trades, by design.
    const totals = totalsFor([trade({ pnl: 0 })]);
    expect(totals.trades).toBe(1);
    expect(totals.wins).toBe(0);
    expect(totals.losses).toBe(0);
  });

  it("classifies on NET, not on gross pnl", () => {
    // A $1 gain that cost $1.50 in commission is a loss. Reading the raw pnl
    // column would file it as a win and overstate the win rate.
    const totals = totalsFor([trade({ pnl: 1, commission: -1.5 })]);
    expect(totals.wins).toBe(0);
    expect(totals.losses).toBe(1);
    expect(totals.net).toBeCloseTo(-0.5, 10);
  });

  it("is gross profit over gross loss", () => {
    const totals = totalsFor([
      trade({ pnl: 30 }),
      trade({ pnl: 10 }),
      trade({ pnl: -20 }),
    ]);
    expect(totals.profitFactor).toBeCloseTo(2, 10);
  });

  it("leaves profit factor null when nothing has lost", () => {
    // Not Infinity: the page prints this, and "∞" in a profit-factor cell
    // reads as a bug rather than as "no losses yet".
    expect(totalsFor([trade({ pnl: 5 })]).profitFactor).toBeNull();
  });

  it("treats a null pnl as zero rather than dropping the trade", () => {
    // An open-at-the-boundary row with no pnl still happened.
    const totals = totalsFor([trade({ pnl: null })]);
    expect(totals.trades).toBe(1);
    expect(totals.net).toBe(0);
  });
});

describe("decorate", () => {
  it("measures how long the trade was held", () => {
    const row = decorate(
      trade({
        open_ts: "2026-10-16T08:00:00Z",
        close_ts: "2026-10-16T10:30:00Z",
        pnl: 4,
      }),
    );
    expect(row.heldMinutes).toBe(150);
    expect(row.net).toBe(4);
  });

  it("says null rather than 0 when an end is missing", () => {
    // Zero minutes would read as an instant scratch, which is a real thing and
    // not what this is.
    expect(decorate(trade({ open_ts: undefined })).heldMinutes).toBeNull();
  });
});

describe("breakdownOf", () => {
  const trades = [
    // Newest first, as the query returns them.
    trade({ symbol: "GBPNZD+", pnl: -3, close_ts: "2026-10-16T10:00:00Z" }),
    trade({ symbol: "EURUSD+", pnl: 6, close_ts: "2026-10-15T10:00:00Z" }),
    trade({ symbol: "GBPNZD+", pnl: -5, close_ts: "2026-10-14T10:00:00Z" }),
    trade({ symbol: "EURUSD+", pnl: -2, close_ts: "2026-10-13T10:00:00Z" }),
  ];

  it("groups by market", () => {
    const rows = breakdownOf(trades);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.symbol)).toContain("EURUSD+");
    expect(rows.map((r) => r.symbol)).toContain("GBPNZD+");
  });

  it("puts the worst market first", () => {
    // An admin opens this to find what is losing money. Ordering by net
    // descending buries it under everything that is working.
    expect(breakdownOf(trades)[0].symbol).toBe("GBPNZD+");
  });

  it("totals each market independently", () => {
    const gbp = breakdownOf(trades).find((r) => r.symbol === "GBPNZD+")!;
    expect(gbp.net).toBe(-8);
    expect(gbp.trades).toBe(2);
    expect(gbp.losses).toBe(2);
    expect(gbp.wins).toBe(0);
    expect(gbp.winRate).toBe(0);
    // Nothing won, so there is no gross profit to divide.
    expect(gbp.profitFactor).toBe(0);
  });

  it("keeps the most recent close, not the last row seen", () => {
    // Input is newest-first, so a later row holds an OLDER timestamp and must
    // not overwrite it.
    const eur = breakdownOf(trades).find((r) => r.symbol === "EURUSD+")!;
    expect(eur.lastClosedAt).toBe("2026-10-15T10:00:00Z");
  });

  it("tracks the best and worst single trade", () => {
    const eur = breakdownOf(trades).find((r) => r.symbol === "EURUSD+")!;
    expect(eur.best).toBe(6);
    expect(eur.worst).toBe(-2);
  });

  it("leaves win rate null when nothing has been decided", () => {
    const [row] = breakdownOf([trade({ pnl: 0 })]);
    expect(row.trades).toBe(1);
    expect(row.winRate).toBeNull();
  });

  it("reconciles with the range totals", () => {
    // The markets table and the figures above it come from two different
    // queries. If the sum of the markets is not the total, one of them is
    // being read wrong — and both are on the same screen.
    const rows = breakdownOf(trades);
    const summed = rows.reduce((acc, r) => acc + r.net, 0);
    expect(summed).toBeCloseTo(totalsFor(trades).net, 10);
    expect(rows.reduce((acc, r) => acc + r.trades, 0)).toBe(
      totalsFor(trades).trades,
    );
  });
});
