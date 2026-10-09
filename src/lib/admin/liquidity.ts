import type { Subscription } from "@/lib/supabase/types";

/**
 * What the COMPANY has taken in, and where it sits.
 *
 * THE DISTINCTION THIS FILE EXISTS TO ENFORCE:
 *
 *   Subscription revenue  is ours. $20 a month for software.
 *   Trading profit/loss   is NOT ours. It belongs to the investors whose
 *                         accounts produced it, and the performance fee is
 *                         configured inside Vantage's MAM panel and paid out
 *                         by Vantage — it never passes through us.
 *
 * So the two are never summed, never shown in the same total, and never put
 * in the same table. A dashboard that added a good trading month to
 * subscription income would be reporting other people's money as company
 * revenue, which is wrong in the accounts and wrong in a far worse way if
 * anybody ever relies on it.
 *
 * WHAT "LIQUIDITY" MEANS HERE, precisely: money we have RECORDED as collected,
 * per payment rail, in the currency that rail actually holds. It is not a bank
 * balance. We do not read ALATPay's ledger or the chain's balance, so this
 * figure does not know about withdrawals, provider fees, chargebacks or
 * anything moved by hand. It answers "what have we taken", not "what is in
 * the account" — and the page says so, because the two drift apart the first
 * time somebody spends it.
 */

export type RailBalance = {
  /** Minor units, in the rail's own currency: kobo, or micro-USDT. */
  amount: number;
  /** How many payments make it up. */
  count: number;
};

export type Liquidity = {
  /** Naira collected through ALATPay transfer and card, in KOBO. */
  ngnKobo: RailBalance;
  /** USDT collected on TRC-20, in MICRO-USDT (6 dp). */
  usdtMicro: RailBalance;
  /**
   * Everything collected, in USD cents at the rate quoted on each payment.
   *
   * A single comparable figure, which is what "how much have we made" wants.
   * Stated at the rate charged at the time, never re-converted at today's
   * rate: those were the dollars we actually agreed, and re-pricing history
   * every time the naira moves makes last month's revenue change.
   */
  totalUsdCents: number;
  /** Refunded, in USD cents. Already subtracted from everything above. */
  refundedUsdCents: number;
};

const EMPTY: RailBalance = { amount: 0, count: 0 };

/**
 * Pure, so it can be tested without a database.
 *
 * Counts CONFIRMED payments only. An invoice raised and never paid is not
 * money, and a liquidity figure that includes it is a figure that says we hold
 * cash we have never seen.
 */
export function liquidityFrom(subscriptions: Subscription[]): Liquidity {
  let ngn = 0;
  let ngnCount = 0;
  let usdt = 0;
  let usdtCount = 0;
  let totalUsdCents = 0;
  let refundedUsdCents = 0;

  for (const s of subscriptions) {
    if (s.status !== "confirmed") continue;

    const refunded = s.refunded_usd ?? 0;
    refundedUsdCents += refunded;

    // Net of the refund, in USD. The refund is recorded in USD because that is
    // what the subscription was priced in.
    totalUsdCents += s.amount_usd - refunded;

    if (s.method === "usdt_trc20") {
      // Paid in USDT. Minor units are micro-USDT, and the USD price is 1:1
      // with USDT by the stablecoin's own premise — which is why there is no
      // rate stored on these rows.
      const micro = (s.amount_usd - refunded) * 10_000;
      usdt += micro;
      usdtCount += 1;
      continue;
    }

    // ALATPay rails settle in naira. amount_ngn is what the payer was actually
    // charged, so it is what arrived — not a reconversion of the USD figure.
    if (s.amount_ngn != null) {
      // A refund is recorded in USD, so the naira it came back out of is
      // scaled by the same proportion rather than re-converted at today's
      // rate. Exact where the whole payment was refunded, which is the case
      // that actually happens.
      const share =
        s.amount_usd > 0 ? (s.amount_usd - refunded) / s.amount_usd : 0;
      ngn += Math.round(s.amount_ngn * share);
      ngnCount += 1;
    }
  }

  return {
    ngnKobo: ngnCount ? { amount: ngn, count: ngnCount } : EMPTY,
    usdtMicro: usdtCount ? { amount: usdt, count: usdtCount } : EMPTY,
    totalUsdCents,
    refundedUsdCents,
  };
}
