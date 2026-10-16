import { describe, expect, it } from "vitest";
import {
  directionSplit,
  howTradesEnd,
  outcomeSplit,
  slicesFrom,
  tradesByMarket,
  MAX_SLICES,
} from "./composition";
import type { BotTrade } from "@/lib/workspace/types";

function trade(partial: Partial<BotTrade>): BotTrade {
  return {
    symbol: "EURUSD+",
    pnl: 0,
    commission: 0,
    swap: 0,
    close_ts: "2026-10-16T10:00:00Z",
    close_reason: "take_profit",
    ...partial,
  } as BotTrade;
}

describe("slicesFrom", () => {
  it("is empty on nothing", () => {
    expect(slicesFrom(new Map())).toEqual({ slices: [], total: 0 });
  });

  it("drops zero counts rather than drawing a wedge of nothing", () => {
    const { slices } = slicesFrom(new Map([["a", 3], ["b", 0]]));
    expect(slices.map((s) => s.label)).toEqual(["a"]);
  });

  it("orders largest first", () => {
    const { slices } = slicesFrom(new Map([["a", 1], ["b", 9], ["c", 5]]));
    expect(slices.map((s) => s.label)).toEqual(["b", "c", "a"]);
  });

  it("shares sum to one", () => {
    const { slices } = slicesFrom(new Map([["a", 1], ["b", 2], ["c", 7]]));
    const sum = slices.reduce((acc, s) => acc + s.share, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("folds the tail into Other past the ceiling", () => {
    // Nine categories: eight slices out, the last two folded together.
    const counts = new Map(
      Array.from({ length: 9 }, (_, i) => [`m${i}`, 10 - i] as const),
    );
    const { slices, total } = slicesFrom(counts);

    expect(slices).toHaveLength(MAX_SLICES);
    expect(slices.at(-1)?.label).toBe("Other (2)");
    // Folded, not dropped — the total still accounts for every trade.
    expect(slices.reduce((acc, s) => acc + s.value, 0)).toBe(total);
  });

  it("adds no Other wedge when nothing is folded", () => {
    // An "Other: 0" entry is a legend row for nothing.
    const counts = new Map([["a", 1], ["b", 2]]);
    const { slices } = slicesFrom(counts);
    expect(slices.some((s) => s.label.startsWith("Other"))).toBe(false);
  });
});

describe("outcomeSplit", () => {
  it("judges on net, not gross pnl", () => {
    // $1 gained, $1.50 paid in commission. Counting the raw column would file
    // this as a win and overstate the rate.
    const { slices } = outcomeSplit([trade({ pnl: 1, commission: -1.5 })]);
    expect(slices.find((s) => s.label === "Lost")?.value).toBe(1);
    expect(slices.find((s) => s.label === "Won")).toBeUndefined();
  });

  it("counts a scratch as neither", () => {
    const { slices, total } = outcomeSplit([trade({ pnl: 0 })]);
    expect(total).toBe(1);
    expect(slices.find((s) => s.label === "Scratched")?.value).toBe(1);
  });

  it("keeps won/lost/scratched in a fixed order", () => {
    // Not sorted by size: the same colour must not mean "won" one week and
    // "lost" the next.
    const { slices } = outcomeSplit([
      trade({ pnl: -5 }),
      trade({ pnl: -5 }),
      trade({ pnl: 3 }),
    ]);
    expect(slices.map((s) => s.label)).toEqual(["Won", "Lost"]);
  });

  it("ignores trades that are still open", () => {
    expect(outcomeSplit([trade({ close_ts: null, pnl: 5 })]).total).toBe(0);
  });
});

describe("howTradesEnd", () => {
  it("humanises the bot's column", () => {
    const { slices } = howTradesEnd([trade({ close_reason: "stop_loss" })]);
    expect(slices[0].label).toBe("Stop loss");
  });

  it("counts a missing reason as Unknown rather than dropping it", () => {
    // The trade still closed; excluding it would make the percentages
    // describe a smaller set than the total claims.
    const { slices, total } = howTradesEnd([
      trade({ close_reason: null }),
      trade({ close_reason: "take_profit" }),
    ]);
    expect(total).toBe(2);
    expect(slices.some((s) => s.label === "Unknown")).toBe(true);
  });

  it("groups equal reasons", () => {
    const { slices } = howTradesEnd([
      trade({ close_reason: "stop_loss" }),
      trade({ close_reason: "stop_loss" }),
      trade({ close_reason: "take_profit" }),
    ]);
    expect(slices[0]).toMatchObject({ label: "Stop loss", value: 2 });
  });
});

describe("tradesByMarket", () => {
  it("counts trades, not money", () => {
    // Effort, not result — a losing market still shows its activity.
    const { slices } = tradesByMarket([
      trade({ symbol: "GBPNZD+", pnl: -50 }),
      trade({ symbol: "GBPNZD+", pnl: -50 }),
      trade({ symbol: "EURUSD+", pnl: 900 }),
    ]);
    expect(slices[0]).toMatchObject({ label: "GBPNZD+", value: 2 });
  });

  it("reconciles with the trade count", () => {
    const trades = Array.from({ length: 20 }, (_, i) =>
      trade({ symbol: `M${i % 12}+` }),
    );
    const { slices, total } = tradesByMarket(trades);
    expect(total).toBe(20);
    expect(slices.reduce((acc, s) => acc + s.value, 0)).toBe(20);
  });
});

describe("directionSplit", () => {
  it("separates long from short, won from lost", () => {
    const { slices, total } = directionSplit([
      trade({ side: "buy", pnl: 5 }),
      trade({ side: "buy", pnl: -5 }),
      trade({ side: "sell", pnl: 7 }),
      trade({ side: "sell", pnl: 7 }),
    ]);
    expect(total).toBe(4);
    expect(slices.find((s) => s.label === "Buy · won")?.value).toBe(1);
    expect(slices.find((s) => s.label === "Buy · lost")?.value).toBe(1);
    expect(slices.find((s) => s.label === "Sell · won")?.value).toBe(2);
    expect(slices.find((s) => s.label === "Sell · lost")).toBeUndefined();
  });

  it("keeps the four in a fixed order regardless of size", () => {
    // The colour for "Sell · lost" must mean the same thing next week.
    const { slices } = directionSplit([
      trade({ side: "sell", pnl: -1 }),
      trade({ side: "sell", pnl: -1 }),
      trade({ side: "sell", pnl: -1 }),
      trade({ side: "buy", pnl: 1 }),
    ]);
    expect(slices.map((s) => s.label)).toEqual(["Buy · won", "Sell · lost"]);
  });

  it("counts a scratch in the total but in no slice", () => {
    // Otherwise four categories become five to describe one trade — but the
    // shares must still describe every closed trade.
    const { slices, total } = directionSplit([
      trade({ side: "buy", pnl: 0 }),
      trade({ side: "buy", pnl: 4 }),
    ]);
    expect(total).toBe(2);
    expect(slices).toHaveLength(1);
    expect(slices[0].share).toBeCloseTo(0.5, 10);
  });

  it("judges on net, like everything else", () => {
    const { slices } = directionSplit([
      trade({ side: "buy", pnl: 1, commission: -1.5 }),
    ]);
    expect(slices[0].label).toBe("Buy · lost");
  });
});
