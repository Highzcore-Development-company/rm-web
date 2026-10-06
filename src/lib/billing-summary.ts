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

  for (const list of byInvestor.values()) {
    const e = entitlementFrom(list, now);
    if (e.active) {
      paidUp += 1;
      if (e.daysRemaining !== null && e.daysRemaining <= 7) expiringSoon += 1;
    } else if (e.lapsed) {
      lapsed += 1;
    }
  }

  // Calendar month in the viewer's timezone is close enough for an ops
  // dashboard; nothing is reconciled against this figure.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const revenueByMethod = { ...EMPTY_BY_METHOD };
  let revenueThisMonthUsd = 0;
  let awaiting = 0;

  for (const s of subscriptions) {
    if (s.status === "awaiting") {
      awaiting += 1;
      continue;
    }
    if (s.status !== "confirmed" || !s.starts_at) continue;

    // Banked when it was confirmed, which is what starts_at records.
    if (new Date(s.starts_at) >= monthStart) {
      revenueThisMonthUsd += s.amount_usd;
      revenueByMethod[s.method] += s.amount_usd;
    }
  }

  return {
    paidUp,
    expiringSoon,
    lapsed,
    revenueThisMonthUsd,
    revenueByMethod,
    awaiting,
  };
}
