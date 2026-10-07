import type { PaymentMethod, Subscription } from "@/lib/supabase/types";
import { entitlementFrom } from "@/lib/entitlement";

/**
 * P2-313 — the numbers behind the admin billing view.
 *
 * Pure, so it can be tested without a database. Revenue counts CONFIRMED
 * payments only: an invoice that was raised and never paid is not revenue, and
 * a dashboard that counts it will overstate the month every month.
 */

export type BillingSummary = {
  /** Investors whose entitlement has not run out. */
  paidUp: number;
  /** Paid up, but expiring within 7 days. */
  expiringSoon: number;
  /** Past expiry and past grace — flagged for MAM detachment. */
  lapsed: number;
  /** Confirmed USD cents taken this calendar month. */
  revenueThisMonthUsd: number;
  /** Same, split by how it was paid. */
  revenueByMethod: Record<PaymentMethod, number>;
  /** Payments raised but not yet confirmed. Not revenue. */
  awaiting: number;

  // ---- A9 ----

  /** Every confirmed payment ever, in USD cents. */
  revenueAllTimeUsd: number;
  /** All-time revenue split by how it was paid. */
  revenueAllTimeByMethod: Record<PaymentMethod, number>;
  /**
   * Monthly recurring revenue, in USD cents.
   *
   * Defined as: for each investor who is paid up right now, the amount of
   * their most recent confirmed term divided by its length in months. So a
   * 12-month term bought at a discount contributes its real monthly value,
   * not a twelfth of the list price and not the whole lump.
   *
   * Refunds are NOT netted off here. A refund is a one-off cash event; this
   * figure describes the term the investor currently holds, and their
   * entitlement is unchanged by money going back out. The revenue figures are
   * where a refund belongs, and that is where it is applied.
   *
   * This is a RUN RATE, not cash. It answers "what is this book worth per
   * month if nobody leaves", which is a different question from the revenue
   * figures above, and the two will not reconcile. They are not meant to.
   */
  mrrUsd: number;
  /** Payments the provider or the chain reported as failed. */
  failed: number;
  /**
   * USD cents refunded, all time. Already SUBTRACTED from the revenue figures
   * above — shown separately so the gross is not simply lost, which would
   * make the netting invisible and the numbers look wrong to anyone holding
   * a bank statement.
   */
  refundedUsd: number;
  /**
   * Who runs out in the next 30 days, soonest first. Investor ids rather
   * than emails: this module is pure and never touches auth.
   */
  upcomingRenewals: {
    investorId: string;
    expiresAt: Date;
    daysRemaining: number;
  }[];
};

const EMPTY_BY_METHOD: Record<PaymentMethod, number> = {
  alatpay_transfer: 0,
  alatpay_card: 0,
  usdt_trc20: 0,
};

export function summarise(
  subscriptions: Subscription[],
  now: Date = new Date(),
): BillingSummary {
  const byInvestor = new Map<string, Subscription[]>();
  for (const s of subscriptions) {
    const list = byInvestor.get(s.investor_id) ?? [];
    list.push(s);
    byInvestor.set(s.investor_id, list);
  }

  let paidUp = 0;
  let expiringSoon = 0;
  let lapsed = 0;
  let mrrUsd = 0;
  const upcomingRenewals: BillingSummary["upcomingRenewals"] = [];

  for (const [investorId, list] of byInvestor.entries()) {
    const e = entitlementFrom(list, now);
    if (e.active) {
      paidUp += 1;
      if (e.daysRemaining !== null && e.daysRemaining <= 7) expiringSoon += 1;

      // A9 — the run rate. The most recent confirmed term is the one that
      // describes what this investor currently pays; earlier terms are
      // history and counting them would inflate MRR with every renewal.
      const latest = list
        .filter((s) => s.status === "confirmed" && s.starts_at)
        .sort((a, b) => ((a.starts_at ?? "") < (b.starts_at ?? "") ? 1 : -1))[0];

      if (latest && latest.months > 0) {
        // Integer cents throughout. Rounded once, here, rather than carried
        // as a fraction — a tenth of a cent per investor is not a number
        // anybody needs, and floats on money are how receipts go wrong.
        mrrUsd += Math.round(latest.amount_usd / latest.months);
      }

      if (e.expiresAt && e.daysRemaining !== null && e.daysRemaining <= 30) {
        upcomingRenewals.push({
          investorId,
          expiresAt: e.expiresAt,
          daysRemaining: e.daysRemaining,
        });
      }
    } else if (e.lapsed) {
      lapsed += 1;
    }
  }

  upcomingRenewals.sort((a, b) => a.daysRemaining - b.daysRemaining);

  // Calendar month in the viewer's timezone is close enough for an ops
  // dashboard; nothing is reconciled against this figure.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const revenueByMethod = { ...EMPTY_BY_METHOD };
  const revenueAllTimeByMethod = { ...EMPTY_BY_METHOD };
  let revenueThisMonthUsd = 0;
  let revenueAllTimeUsd = 0;
  let awaiting = 0;
  let failed = 0;
  let refundedUsd = 0;

  for (const s of subscriptions) {
    if (s.status === "awaiting") {
      awaiting += 1;
      continue;
    }
    if (s.status === "failed") {
      failed += 1;
      continue;
    }
    if (s.status !== "confirmed" || !s.starts_at) continue;

    // Net of any recorded refund. A refunded month that still counts as
    // revenue overstates that month forever, and the figure is what the
    // boss reads — so the netting happens here, once, rather than in each
    // place a number is displayed.
    const net = s.amount_usd - (s.refunded_usd ?? 0);
    refundedUsd += s.refunded_usd ?? 0;

    revenueAllTimeUsd += net;
    revenueAllTimeByMethod[s.method] += net;

    // Banked when it was confirmed, which is what starts_at records. The
    // refund is netted against the ORIGINAL month, not the month it was paid
    // back in: this is an ops dashboard, and "which month was that sale in"
    // is the question it answers.
    if (new Date(s.starts_at) >= monthStart) {
      revenueThisMonthUsd += net;
      revenueByMethod[s.method] += net;
    }
  }

  return {
    paidUp,
    expiringSoon,
    lapsed,
    revenueThisMonthUsd,
    revenueByMethod,
    awaiting,
    revenueAllTimeUsd,
    revenueAllTimeByMethod,
    mrrUsd,
    failed,
    refundedUsd,
    upcomingRenewals,
  };
}
