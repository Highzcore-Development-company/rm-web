import { describe, expect, it } from "vitest";
import { instrumentMovePercent } from "@/lib/trade-move";

/**
 * P2-506. The sell case is the whole reason this is a tested function: a short
 * that closes below its entry MADE money, and inverting that would email every
 * investor that they lost on their winners.
 */
describe("instrumentMovePercent", () => {
  it("is positive when a buy closes above its entry", () => {
    expect(instrumentMovePercent("buy", 100, 102)).toBeCloseTo(2);
  });

  it("is negative when a buy closes below its entry", () => {
    expect(instrumentMovePercent("buy", 100, 98)).toBeCloseTo(-2);
  });

  it("is POSITIVE when a sell closes below its entry", () => {
    // The one that matters. Price fell, the short won.
    expect(instrumentMovePercent("sell", 100, 98)).toBeCloseTo(2);
  });

  it("is negative when a sell closes above its entry", () => {
    expect(instrumentMovePercent("sell", 100, 102)).toBeCloseTo(-2);
  });

  it("treats side case-insensitively", () => {
    // rm-server types side as a loose string, so "SELL" is possible.
    expect(instrumentMovePercent("SELL", 100, 98)).toBeCloseTo(2);
  });

  it("returns null rather than Infinity on a zero entry price", () => {
    expect(instrumentMovePercent("buy", 0, 50)).toBeNull();
  });

  it("returns null when either price is missing", () => {
    expect(instrumentMovePercent("buy", null, 100)).toBeNull();
    expect(instrumentMovePercent("buy", 100, null)).toBeNull();
    expect(instrumentMovePercent("buy", 100, undefined)).toBeNull();
  });

  it("reports an unchanged price as zero, not null", () => {
    // A flat close is a real outcome and should say so.
    expect(instrumentMovePercent("buy", 100, 100)).toBe(0);
  });
});
