import { describe, expect, it } from "vitest";
import { formatUsd, PLANS, priceFor } from "./pricing";
import {
  QUOTED_USD_NGN_E6,
  usdCentsToMicroUsdt,
  usdCentsToNgnKobo,
} from "./money";
import { entitlementFrom, shouldTrade } from "./entitlement";
import type { Subscription } from "./supabase/types";

describe("pricing", () => {
  it("matches the table in the brief exactly", () => {
    // 1mo $20, 3mo $57, 6mo $114, 12mo $228. If this fails, either the engine
    // is wrong or someone has changed the published price without saying so.
    expect(PLANS.map((p) => formatUsd(p.totalCents))).toEqual([
      "$20",
      "$57",
      "$114",
      "$228",
    ]);
  });

  it("charges no discount for a single month", () => {
    expect(priceFor(1).discountCents).toBe(0);
  });

  it("rounds the discount in the investor's favour", () => {
    // 5% of an odd subtotal cannot land on a whole cent. The rounding must
    // never take the fraction from them.
    const p = priceFor(7); // 14000 cents, 5% = 700 exactly
    expect(p.discountCents).toBe(Math.floor((p.subtotalCents * 500) / 10_000));
    expect(p.totalCents).toBe(p.subtotalCents - p.discountCents);
  });

  it("refuses a nonsense term", () => {
    expect(() => priceFor(0)).toThrow();
    expect(() => priceFor(-3)).toThrow();
    expect(() => priceFor(1.5)).toThrow();
  });
});

describe("currency conversion", () => {
  it("converts cents to kobo at the quoted rate", () => {
    // $20 at ₦1,550 = ₦31,000 = 3,100,000 kobo.
    expect(usdCentsToNgnKobo(2000, QUOTED_USD_NGN_E6)).toBe(3_100_000);
  });

  it("rounds NGN up, never down", () => {
    // A transfer short by a kobo is a failed payment, so any fraction rounds
    // towards us rather than leaving the investor underpaid.
    // 1 cent at a rate with a fractional tail: 1550.000001 kobo -> 1551.
    expect(usdCentsToNgnKobo(1, 1_550_000_001)).toBe(1551);
  });

  it("converts cents to micro-USDT exactly", () => {
    expect(usdCentsToMicroUsdt(2000)).toBe(20_000_000);
    expect(usdCentsToMicroUsdt(5700)).toBe(57_000_000);
  });

  it("refuses bad input rather than producing a wrong amount", () => {
    expect(() => usdCentsToNgnKobo(-1, QUOTED_USD_NGN_E6)).toThrow();
    expect(() => usdCentsToNgnKobo(20.5, QUOTED_USD_NGN_E6)).toThrow();
    expect(() => usdCentsToNgnKobo(2000, 0)).toThrow();
  });
});

function sub(expiresAt: string | null, status = "confirmed"): Subscription {
  return {
    id: "s",
    investor_id: "i",
    months: 1,
    amount_usd: 2000,
    amount_ngn: null,
    fx_usd_ngn_e6: null,
    method: "alatpay_transfer",
    status: status as Subscription["status"],
    provider_ref: "ref",
  provider_account_number: null,
  provider_bank_name: null,
  provider_account_name: null,
  problem: null,
  problem_detail: null,
    starts_at: "2026-01-01T00:00:00Z",
    expires_at: expiresAt,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("entitlement", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("treats someone who never paid as lapsed, not active", () => {
    const e = entitlementFrom([], now);
    expect(e.active).toBe(false);
    expect(e.lapsed).toBe(true);
    expect(shouldTrade(e)).toBe(false);
  });

  it("ignores unconfirmed payments entirely", () => {
    // An invoice raised and never paid must not buy a single day.
    const e = entitlementFrom([sub("2026-12-01T00:00:00Z", "awaiting")], now);
    expect(e.active).toBe(false);
    expect(shouldTrade(e)).toBe(false);
  });

  it("takes the latest expiry across several payments", () => {
    const e = entitlementFrom(
      [sub("2026-07-01T00:00:00Z"), sub("2026-09-01T00:00:00Z")],
      now,
    );
    expect(e.expiresAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(e.active).toBe(true);
  });

  it("keeps trading through the grace period", () => {
    // Expired yesterday. Cutting someone off mid-position the hour their card
    // fails is worse for them than three unpaid days are for us.
    const e = entitlementFrom([sub("2026-05-31T12:00:00Z")], now);
    expect(e.active).toBe(false);
    expect(e.inGrace).toBe(true);
    expect(e.lapsed).toBe(false);
    expect(shouldTrade(e)).toBe(true);
  });

  it("stops trading once grace is past", () => {
    const e = entitlementFrom([sub("2026-05-01T12:00:00Z")], now);
    expect(e.inGrace).toBe(false);
    expect(e.lapsed).toBe(true);
    expect(shouldTrade(e)).toBe(false);
  });

  it("fires a reminder on the day, not every day before it", () => {
    // Otherwise a daily job emails the same person seven times.
    expect(
      entitlementFrom([sub("2026-06-08T12:00:00Z")], now).reminderDue,
    ).toBe(7);
    expect(
      entitlementFrom([sub("2026-06-02T12:00:00Z")], now).reminderDue,
    ).toBe(1);
    expect(
      entitlementFrom([sub("2026-06-05T12:00:00Z")], now).reminderDue,
    ).toBeNull();
  });
});
