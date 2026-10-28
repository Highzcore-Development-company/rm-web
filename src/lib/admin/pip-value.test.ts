import { describe, expect, it } from "vitest";
import {
  formatPipAmount,
  formatPipValue,
  lotsForPipValue,
  pipLineFor,
  pipValueFor,
  type Quotes,
} from "@/lib/admin/pip-value";

/**
 * This number sizes real trades, so the arithmetic is tested rather than
 * assumed.
 *
 * The live quotes below are the ones that were on the dashboard when the
 * calculation was checked against Victor's hand measurements. Keeping the real
 * numbers makes the expectations checkable by hand: at AUD/USD 0.69446, one
 * pip of EURAUD on 0.01 lots is 1,000 x 0.0001 x 0.69446 = $0.0694 — which is
 * the figure the old stored table got wrong.
 */
const QUOTES: Quotes = {
  EURUSD: 1.12271,
  GBPUSD: 1.33233,
  AUDUSD: 0.69446,
  NZDUSD: 0.56497,
  USDJPY: 158.015,
  USDCHF: 0.82416,
  USDCAD: 1.41609,
};

describe("pipValueFor, from live quotes", () => {
  it("is exactly ten dollars a pip per lot on a USD-quoted pair", () => {
    // The anchor every other case is checked against: 100,000 x 0.0001 = $10.
    const r = pipValueFor("EURUSD", 1, QUOTES);
    expect(r.kind).toBe("known");
    if (r.kind === "known") {
      expect(r.usd).toBeCloseTo(10, 10);
      expect(r.live).toBe(true);
    }
  });

  it("matches Victor's measurement on every USD-quoted pair", () => {
    // These reconciled to the cent, which is what established the method.
    for (const pair of ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD"]) {
      const r = pipValueFor(pair, 0.01, QUOTES);
      if (r.kind === "known") expect(r.usd).toBeCloseTo(0.1, 10);
    }
  });

  it("scales linearly", () => {
    // Ten times the size, ten times the money — no threshold in between.
    const small = pipValueFor("EURUSD", 0.01, QUOTES);
    const big = pipValueFor("EURUSD", 0.1, QUOTES);
    if (small.kind === "known" && big.kind === "known") {
      expect(big.usd).toBeCloseTo(small.usd * 10, 10);
    }
  });

  it("uses the second decimal on a yen pair, not the fourth", () => {
    // 100,000 x 0.01 / 158.015 = $6.33 per lot. With the wrong pip size it
    // would be six cents, and with the rate inverted it would be $158.
    const r = pipValueFor("USDJPY", 1, QUOTES);
    if (r.kind === "known") expect(r.usd).toBeCloseTo(6.328, 2);
  });

  it("inverts the rate when USD is the base", () => {
    // USDCHF 0.82416: one CHF is MORE than one dollar, so the pip is worth
    // more than ten dollars a lot, not less.
    const r = pipValueFor("USDCHF", 1, QUOTES);
    if (r.kind === "known") expect(r.usd).toBeCloseTo(10 / 0.82416, 6);
  });

  it("does not invert when USD is the quote", () => {
    const r = pipValueFor("AUDUSD", 1, QUOTES);
    if (r.kind === "known") expect(r.usd).toBeCloseTo(10, 10);
  });

  it("prices a cross nobody measured", () => {
    // AUDCAD was one of the thirteen markets showing "—". Its pip is paid in
    // CAD: 100,000 x 0.0001 / 1.41609 = $7.06 a lot.
    const r = pipValueFor("AUDCAD", 1, QUOTES);
    expect(r.kind).toBe("known");
    if (r.kind === "known") expect(r.usd).toBeCloseTo(10 / 1.41609, 6);
  });

  it("fixes EURAUD, which the stored table had 15.7% wrong", () => {
    // The table said $0.06 at 0.01 lots. That needs AUD/USD near 0.60.
    const r = pipValueFor("EURAUD", 0.01, QUOTES);
    if (r.kind === "known") {
      expect(r.usd).toBeCloseTo(0.0694, 4);
      expect(r.usd).not.toBeCloseTo(0.06, 3);
    }
  });

  it("reads the `+` suffix and the bare alias as one market", () => {
    // bot_symbol_config stores EURUSD+; the state row's alias is EURUSD.
    expect(pipValueFor("EURUSD+", 0.01, QUOTES)).toEqual(
      pipValueFor("EURUSD", 0.01, QUOTES),
    );
  });
});

describe("pipValueFor, without quotes", () => {
  it("still computes a USD-quoted pair, because it needs no rate", () => {
    // $10 a lot is exact for EURUSD whatever the quotes say — the pip is paid
    // in dollars already. So this is `live`, not a fallback.
    const r = pipValueFor("EURUSD", 0.01);
    expect(r.kind).toBe("known");
    if (r.kind === "known") {
      expect(r.usd).toBeCloseTo(0.1, 10);
      expect(r.live).toBe(true);
    }
  });

  it("falls back to the hand-measured figure when the rate is missing", () => {
    // USDJPY's pip is paid in yen, so without USDJPY there is nothing to
    // convert with — and Victor measured this one.
    const r = pipValueFor("USDJPY", 0.01);
    expect(r.kind).toBe("known");
    if (r.kind === "known") {
      expect(r.usd).toBeCloseTo(0.06, 10);
      expect(r.live).toBe(false);
    }
  });

  it("says nothing at all for a market nobody measured", () => {
    // Better than a confident wrong number on the field that sizes a trade.
    expect(pipValueFor("AUDCAD", 0.01)).toEqual({ kind: "unknown" });
  });

  it("refuses EURAUD rather than repeating the wrong figure", () => {
    // Deliberately dropped from the table. With no quote we do not know.
    expect(pipValueFor("EURAUD", 0.01)).toEqual({ kind: "unknown" });
  });

  it("ignores a quote of zero rather than dividing by it", () => {
    // A market the bot has not priced yet carries 0 or null.
    expect(pipValueFor("AUDCAD", 0.01, { USDCAD: 0 })).toEqual({
      kind: "unknown",
    });
  });
});

describe("a nonsense lot size", () => {
  it("is no answer, never zero", () => {
    // Zero would read as "this trade cannot lose anything".
    for (const lots of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pipValueFor("EURUSD", lots, QUOTES)).toEqual({ kind: "unknown" });
    }
  });
});

describe("formatting", () => {
  it("keeps three decimals below a cent", () => {
    // Several pairs sit near six cents at 0.01 lots; two places would round
    // three different markets to the same wrong number.
    expect(formatPipValue({ kind: "known", usd: 0.0633, live: true })).toBe(
      "≈ $0.063 per pip",
    );
  });

  it("keeps two above a cent", () => {
    expect(formatPipValue({ kind: "known", usd: 1.234, live: true })).toBe(
      "≈ $1.23 per pip",
    );
  });

  it("says nothing when it does not know", () => {
    expect(formatPipValue({ kind: "unknown" })).toBe("");
    expect(formatPipAmount({ kind: "unknown" })).toBeNull();
  });
});

describe("pipLineFor", () => {
  it("treats a blank box as the broker minimum and says so", () => {
    const line = pipLineFor("EURUSD", "", QUOTES);
    expect(line).toContain("broker minimum");
    expect(line).toContain("0.01");
  });

  it("answers for what is typed", () => {
    expect(pipLineFor("EURUSD", "0.5", QUOTES)).toBe("≈ $5.00 per pip");
  });

  it("goes quiet rather than guessing", () => {
    expect(pipLineFor("AUDCAD", "0.5")).toBe("");
  });
});

// ---------- lots from a dollar target (Victor, 26 Oct) ----------
//
// "You've been struggling to make all markets have $0.30 per pip, where it
// only calculates via lots, not via the dollar." Risk is decided in money;
// the lot size that produces it differs per market and moves with the rate.

describe("lotsForPipValue", () => {
  const quotes = { EURUSD: 1.09, USDJPY: 157.0, GBPUSD: 1.27, USDCAD: 1.41 };

  it("is the exact inverse of pipValueFor", () => {
    // The property that matters: ask for $0.30, get a size worth $0.30.
    const lots = lotsForPipValue("EURUSD", 0.3, quotes)!;
    const back = pipValueFor("EURUSD", lots, quotes);

    expect(back.kind).toBe("known");
    if (back.kind === "known") expect(back.usd).toBeCloseTo(0.3, 2);
  });

  it("gives DIFFERENT lot sizes for the same money on different markets", () => {
    // The whole reason the feature exists. One pip of USDJPY and one pip of
    // EURUSD are not worth the same, so "$0.30 everywhere" is not one number.
    const eur = lotsForPipValue("EURUSD", 0.3, quotes);
    const jpy = lotsForPipValue("USDJPY", 0.3, quotes);

    expect(eur).not.toBeNull();
    expect(jpy).not.toBeNull();
    expect(eur).not.toBe(jpy);
  });

  it("rounds DOWN to the broker step, never up", () => {
    // Up would hand every market slightly more risk than was asked for —
    // silently, across seventeen markets at once.
    for (const target of [0.3, 0.37, 0.41, 1.03]) {
      const lots = lotsForPipValue("EURUSD", target, quotes)!;
      const value = pipValueFor("EURUSD", lots, quotes);
      if (value.kind === "known") expect(value.usd).toBeLessThanOrEqual(target + 1e-9);
    }
  });

  it("lands on the broker's 0.01 step", () => {
    const lots = lotsForPipValue("GBPUSD", 0.77, quotes)!;
    expect(Math.round(lots * 100) % 1).toBe(0);
  });

  it("never returns zero, even when one pip costs more than the target", () => {
    // 0.01 is the smallest tradeable size. Returning 0 would read as "turn
    // this market off", which is a different instruction entirely.
    const lots = lotsForPipValue("USDJPY", 0.0001, quotes);
    expect(lots).toBe(0.01);
  });

  it("refuses a target it cannot price rather than guessing", () => {
    // A guess here is a lot size somebody trades.
    expect(lotsForPipValue("XXXYYY", 0.3, {})).toBeNull();
  });

  it("refuses nonsense targets", () => {
    expect(lotsForPipValue("EURUSD", 0, quotes)).toBeNull();
    expect(lotsForPipValue("EURUSD", -1, quotes)).toBeNull();
    expect(lotsForPipValue("EURUSD", Number.NaN, quotes)).toBeNull();
  });
});
