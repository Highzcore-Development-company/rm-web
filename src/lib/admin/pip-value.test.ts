import { describe, expect, it } from "vitest";
import { formatPipValue, pipLineFor, pipValueFor } from "@/lib/admin/pip-value";

/**
 * This number sizes real trades, so the scaling is tested rather than assumed.
 * Victor's example is the first case: 0.01 lots of EURUSD is $0.10 a pip, so
 * 0.1 lots must be $1.00 — ten times the size, ten times the money.
 */

describe("pipValueFor", () => {
  it("scales linearly from the measured 0.01 lot figure", () => {
    expect(pipValueFor("EURUSD", 0.01)).toEqual({ kind: "known", usd: 0.1 });
    const tenTimes = pipValueFor("EURUSD", 0.1);
    expect(tenTimes.kind).toBe("known");
    if (tenTimes.kind === "known") expect(tenTimes.usd).toBeCloseTo(1, 10);
  });

  it("handles a full lot", () => {
    const r = pipValueFor("EURUSD", 1);
    if (r.kind === "known") expect(r.usd).toBeCloseTo(10, 10);
  });

  it("keeps each market's own rate", () => {
    // These differ because of the quote currency, and conflating them would
    // misreport the pairs an admin is most likely to resize.
    const eurgbp = pipValueFor("EURGBP", 0.01);
    const usdjpy = pipValueFor("USDJPY", 0.01);
    if (eurgbp.kind === "known") expect(eurgbp.usd).toBeCloseTo(0.13, 10);
    if (usdjpy.kind === "known") expect(usdjpy.usd).toBeCloseTo(0.06, 10);
  });

  it("matches the Raw ECN symbol with its + suffix", () => {
    // bot_symbol_config stores EURUSD+, the table is keyed EURUSD. Without
    // this the figure would vanish on every market.
    expect(pipValueFor("EURUSD+", 0.01)).toEqual(pipValueFor("EURUSD", 0.01));
    expect(pipValueFor("usdjpy+", 0.01)).toEqual(pipValueFor("USDJPY", 0.01));
  });

  it("says crypto depends on the broker rather than guessing", () => {
    expect(pipValueFor("BTCUSD", 0.1).kind).toBe("broker");
    expect(pipValueFor("ETHUSD", 0.1).kind).toBe("broker");
  });

  it("is unknown for a market nobody has measured", () => {
    expect(pipValueFor("XAUUSD", 0.1).kind).toBe("unknown");
  });

  it("refuses a zero or blank lot size rather than reporting zero", () => {
    // Zero would read as "this cannot lose anything", on the very field that
    // decides how much it can.
    expect(pipValueFor("EURUSD", 0).kind).toBe("unknown");
    expect(pipValueFor("EURUSD", NaN).kind).toBe("unknown");
    expect(pipValueFor("EURUSD", -1).kind).toBe("unknown");
  });
});

describe("formatPipValue", () => {
  it("keeps three decimals below a cent so near values stay distinct", () => {
    // At 0.01 lots several pairs sit at $0.06; two decimals would make
    // different markets look identical.
    // $0.06 is below the boundary, so the third decimal is kept — several
    // pairs sit near here and two decimals would flatten them together.
    expect(formatPipValue(pipValueFor("USDJPY", 0.01))).toBe("≈ $0.060 per pip");
    // 0.13 is already at the threshold, so two decimals is exact and reads
    // better — three would be "$0.130" for no gain.
    expect(formatPipValue(pipValueFor("EURGBP", 0.01))).toBe("≈ $0.13 per pip");
  });

  it("uses cents once the figure is big enough to need them", () => {
    expect(formatPipValue(pipValueFor("EURUSD", 0.1))).toBe("≈ $1.00 per pip");
  });

  it("says so for crypto, and nothing at all when unknown", () => {
    expect(formatPipValue({ kind: "broker" })).toMatch(/broker/);
    expect(formatPipValue({ kind: "unknown" })).toBe("");
  });
});

describe("pipLineFor", () => {
  it("treats a blank box as the broker minimum and says so", () => {
    // Every market has no lot size set today, so this is the common case.
    // $0.10 sits exactly on the two-decimal boundary, so it is not padded.
    expect(pipLineFor("EURUSD+", "")).toBe(
      "≈ $0.10 per pip at the broker minimum (0.01)",
    );
  });

  it("uses what is typed once something is", () => {
    expect(pipLineFor("EURUSD+", "0.1")).toBe("≈ $1.00 per pip");
  });

  it("stays silent on a market it cannot price, blank or not", () => {
    expect(pipLineFor("XAUUSD", "")).toBe("");
    expect(pipLineFor("XAUUSD", "0.5")).toBe("");
  });

  it("still names crypto as broker-dependent when blank", () => {
    expect(pipLineFor("BTCUSD", "")).toMatch(/broker/);
  });
});
