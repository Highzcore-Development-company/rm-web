import { describe, expect, it, vi } from "vitest";

import { createAppStore } from "./create-app-store";
import type { BotMarket } from "@/lib/workspace/types";

/**
 * A BotMarket with every field set, so a merge test can prove a field SURVIVED
 * rather than prove `undefined === undefined`. Spread `over` to vary one.
 */
const market = (symbol: string, over: Partial<BotMarket> = {}): BotMarket => ({
  symbol,
  alias: symbol.replace("+", ""),
  timeframe: "M15",
  htf: "H1",
  entry_trend: null,
  htf_trend: null,
  state: null,
  reason: null,
  latest_signal: null,
  price: 1.1,
  level: null,
  pnl: null,
  sl: null,
  tp: null,
  volume: null,
  opened_at: null,
  strategy: "trend_pullback",
  is_dry_run: false,
  updated_at: "2026-10-11T00:00:00Z",
  snapshot: null,
  ...over,
} as BotMarket);

describe("store isolation", () => {
  /**
   * The property the whole provider design exists to guarantee.
   *
   * A "use client" component is still server-rendered for the initial HTML, so
   * a module-level store would be created once per server process and shared
   * by every request it handles — one investor's state rendered into another
   * investor's page. createAppStore() is called per request inside
   * StoreProvider precisely so that cannot happen, and this is the assertion
   * that says so.
   */
  it("two stores share nothing", () => {
    const a = createAppStore();
    const b = createAppStore();

    a.getState().setMarkets([market("EURUSD+")]);
    a.getState().pushToast("for user A", "success");
    a.getState().setDeskTab("history");

    expect(b.getState().markets).toEqual([]);
    expect(b.getState().toasts).toEqual([]);
    expect(b.getState().hydrated).toBe(false);
    expect(b.getState().deskTab).toBe("market");
  });

  it("gives each store its own toast ids", () => {
    // A module-level id counter would hand two users' toasts the same React
    // key in the same render pass.
    const a = createAppStore();
    const b = createAppStore();

    a.getState().pushToast("one", "success");
    a.getState().pushToast("two", "success");
    b.getState().pushToast("first for B", "error");

    expect(a.getState().toasts.map((t) => t.id)).toEqual([0, 1]);
    expect(b.getState().toasts.map((t) => t.id)).toEqual([0]);
  });
});

describe("toasts", () => {
  it("pushes and dismisses by id", () => {
    const s = createAppStore();
    s.getState().pushToast("saved", "success");
    s.getState().pushToast("failed", "error");

    const [first, second] = s.getState().toasts;
    expect(second.tone).toBe("error");

    s.getState().dismissToast(first.id);
    expect(s.getState().toasts.map((t) => t.message)).toEqual(["failed"]);
  });

  it("dismisses itself after the timeout", () => {
    vi.useFakeTimers();
    try {
      const s = createAppStore();
      s.getState().pushToast("transient", "success");
      expect(s.getState().toasts).toHaveLength(1);

      vi.advanceTimersByTime(4500);
      expect(s.getState().toasts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dismissing an id that is already gone is harmless", () => {
    // The auto-dismiss timer fires whether or not the user got there first.
    const s = createAppStore();
    s.getState().pushToast("a", "success");
    const id = s.getState().toasts[0].id;

    s.getState().dismissToast(id);
    s.getState().dismissToast(id);
    expect(s.getState().toasts).toEqual([]);
  });
});

describe("markets", () => {
  it("merges a realtime row instead of replacing it", () => {
    // A payload carries the columns that changed; assigning it wholesale
    // blanks every field that did not.
    const s = createAppStore();
    s.getState().setMarkets([market("EURUSD+", { price: 1.1, strategy: "mtf" })]);

    // What Realtime actually delivers: the columns that changed, nothing else.
    s.getState().mergeMarket({ symbol: "EURUSD+", price: 1.15 } as BotMarket);

    expect(s.getState().markets[0]).toMatchObject({
      symbol: "EURUSD+",
      price: 1.15,       // applied
      strategy: "mtf",   // survived
      timeframe: "M15",  // survived
    });
  });

  it("appends a symbol it has not seen", () => {
    const s = createAppStore();
    s.getState().setMarkets([market("EURUSD+")]);
    s.getState().mergeMarket(market("USDCAD+"));

    expect(s.getState().markets.map((m) => m.symbol)).toEqual([
      "EURUSD+",
      "USDCAD+",
    ]);
  });

  it("is not hydrated until it has rows of its own", () => {
    // Consumers fall back to the server snapshot while this is false, which is
    // what keeps the first client render identical to the server's HTML.
    const s = createAppStore();
    expect(s.getState().hydrated).toBe(false);

    s.getState().mergeMarket(market("EURUSD+"));
    expect(s.getState().hydrated).toBe(true);
  });
});

describe("desk layout", () => {
  it("starts with both rails open", () => {
    const s = createAppStore();
    expect(s.getState().scoraOpen).toBe(true);
    expect(s.getState().feedOpen).toBe(true);
  });

  it("toggles independently", () => {
    const s = createAppStore();
    s.getState().toggleScora();

    expect(s.getState().scoraOpen).toBe(false);
    expect(s.getState().feedOpen).toBe(true);
  });

  it("sets a tab", () => {
    const s = createAppStore();
    s.getState().setDeskTab("live");
    expect(s.getState().deskTab).toBe("live");
  });
});
