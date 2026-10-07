import { describe, expect, it } from "vitest";
import { summarise } from "@/lib/billing-summary";
import type { PaymentMethod, Subscription, SubscriptionStatus } from "@/lib/supabase/types";

/**
 * A9 — the finance figures.
 *
 * Tested because MRR is a DEFINITION, not an arithmetic fact: several
 * defensible numbers could be called "monthly recurring revenue" from the same
 * rows, and the one we chose has to stay chosen. A test is how that survives
 * the next person to touch this file.
 */

const NOW = new Date("2026-06-15T12:00:00Z");

function sub(overrides: {
  investor_id: string;
  months: number;
  amount_usd: number;
  status?: SubscriptionStatus;
  method?: PaymentMethod;
  starts_at?: string | null;
  expires_at?: string | null;
}): Subscription {
  return {
    id: `${overrides.investor_id}-${overrides.starts_at ?? "x"}-${overrides.amount_usd}`,
    investor_id: overrides.investor_id,
    months: overrides.months,
    amount_usd: overrides.amount_usd,
    amount_ngn: null,
    fx_usd_ngn_e6: null,
    method: overrides.method ?? "alatpay_transfer",
    status: overrides.status ?? "confirmed",
    provider_ref: null,
    provider_account_number: null,
    provider_bank_name: null,
    provider_account_name: null,
    problem: null,
    problem_detail: null,
    starts_at: overrides.starts_at ?? null,
    expires_at: overrides.expires_at ?? null,
    created_at: overrides.starts_at ?? "2026-01-01T00:00:00Z",
    updated_at: overrides.starts_at ?? "2026-01-01T00:00:00Z",
  };
}

describe("summarise — A9 figures", () => {
  it("counts every confirmed payment in revenue to date, not just this month", () => {
    const s = summarise(
      [
        sub({
          investor_id: "a",
          months: 1,
          amount_usd: 2000,
          starts_at: "2026-01-10T00:00:00Z",
          expires_at: "2026-02-10T00:00:00Z",
        }),
        sub({
          investor_id: "a",
          months: 1,
          amount_usd: 2000,
          starts_at: "2026-06-02T00:00:00Z",
          expires_at: "2026-07-02T00:00:00Z",
        }),
      ],
      NOW,
    );

    expect(s.revenueAllTimeUsd).toBe(4000);
    expect(s.revenueThisMonthUsd).toBe(2000);
  });

  it("excludes awaiting and failed from revenue, and counts them separately", () => {
    const s = summarise(
      [
        sub({
          investor_id: "a",
          months: 1,
          amount_usd: 2000,
          status: "awaiting",
          starts_at: "2026-06-02T00:00:00Z",
        }),
        sub({
          investor_id: "b",
          months: 1,
          amount_usd: 2000,
          status: "failed",
          starts_at: "2026-06-02T00:00:00Z",
        }),
      ],
      NOW,
    );

    expect(s.revenueAllTimeUsd).toBe(0);
    expect(s.awaiting).toBe(1);
    expect(s.failed).toBe(1);
  });

  it("prices MRR from the latest term's monthly value, not the lump sum", () => {
    // A 12-month term at a 5% discount: $228 for the year, so $19/month.
    const s = summarise(
      [
        sub({
          investor_id: "a",
          months: 12,
          amount_usd: 22800,
          starts_at: "2026-03-01T00:00:00Z",
          expires_at: "2027-03-01T00:00:00Z",
        }),
      ],
      NOW,
    );

    expect(s.mrrUsd).toBe(1900);
    // The whole year is cash already taken. The two must not be confused.
    expect(s.revenueAllTimeUsd).toBe(22800);
  });

  it("does not stack earlier terms into MRR when an investor renews", () => {
    // Two one-month terms back to back is still a $20/month investor.
    const s = summarise(
      [
        sub({
          investor_id: "a",
          months: 1,
          amount_usd: 2000,
          starts_at: "2026-05-01T00:00:00Z",
          expires_at: "2026-06-01T00:00:00Z",
        }),
        sub({
          investor_id: "a",
          months: 1,
          amount_usd: 2000,
          starts_at: "2026-06-01T00:00:00Z",
          expires_at: "2026-07-01T00:00:00Z",
        }),
      ],
      NOW,
    );

    expect(s.mrrUsd).toBe(2000);
  });

  it("leaves lapsed investors out of MRR", () => {
    const s = summarise(
      [
        sub({
          investor_id: "gone",
          months: 1,
          amount_usd: 2000,
          starts_at: "2026-01-01T00:00:00Z",
          expires_at: "2026-02-01T00:00:00Z",
        }),
      ],
      NOW,
    );

    expect(s.mrrUsd).toBe(0);
    expect(s.paidUp).toBe(0);
    // Still revenue: the money was taken and is not refunded by them leaving.
    expect(s.revenueAllTimeUsd).toBe(2000);
  });

  it("lists upcoming renewals soonest first and ignores anything past 30 days", () => {
    const s = summarise(
      [
        sub({
          investor_id: "soon",
          months: 1,
          amount_usd: 2000,
          starts_at: "2026-06-01T00:00:00Z",
          expires_at: "2026-06-20T00:00:00Z",
        }),
        sub({
          investor_id: "later",
          months: 1,
          amount_usd: 2000,
          starts_at: "2026-06-01T00:00:00Z",
          expires_at: "2026-07-10T00:00:00Z",
        }),
        sub({
          investor_id: "ages",
          months: 12,
          amount_usd: 22800,
          starts_at: "2026-06-01T00:00:00Z",
          expires_at: "2027-06-01T00:00:00Z",
        }),
      ],
      NOW,
    );

    expect(s.upcomingRenewals.map((r) => r.investorId)).toEqual([
      "soon",
      "later",
    ]);
  });

  it("splits revenue by method for both this month and all time", () => {
    const s = summarise(
      [
        sub({
          investor_id: "a",
          months: 1,
          amount_usd: 2000,
          method: "usdt_trc20",
          starts_at: "2026-02-01T00:00:00Z",
          expires_at: "2026-03-01T00:00:00Z",
        }),
        sub({
          investor_id: "b",
          months: 1,
          amount_usd: 2000,
          method: "alatpay_transfer",
          starts_at: "2026-06-05T00:00:00Z",
          expires_at: "2026-07-05T00:00:00Z",
        }),
      ],
      NOW,
    );

    expect(s.revenueAllTimeByMethod.usdt_trc20).toBe(2000);
    expect(s.revenueAllTimeByMethod.alatpay_transfer).toBe(2000);
    expect(s.revenueByMethod.usdt_trc20).toBe(0);
    expect(s.revenueByMethod.alatpay_transfer).toBe(2000);
  });
});
