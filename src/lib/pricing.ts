/**
 * P2-301 — pricing engine. The single source of truth for what a subscription
 * costs. The pricing page, checkout and the backend activation path all read
 * from here; nothing computes a price on its own.
 *
 * Money is handled in integer cents throughout. Never float dollars — 0.1 + 0.2
 * is not 0.3, and this number ends up on a receipt.
 */

/** $20.00 per month, before any discount. */
export const MONTHLY_PRICE_CENTS = 2000;

/**
 * Discount per term, in basis points. Set by Victor, 11 Oct 2026.
 *
 * It was a single 5% applied to every term over a month, which meant 3, 6 and
 * 12 all worked out at $19/mo — the page said "pay longer, pay less" and then
 * offered no reason to. The ladder is steep on purpose: a year commits before
 * a track record exists, and that is what is being paid for.
 *
 *     1 month    0%     $20.00/mo
 *     3 months  15%     $17.00/mo
 *     6 months  35%     $13.00/mo
 *    12 months  60%      $8.00/mo
 *
 * A term not listed here gets no discount rather than a guessed one.
 */
export const TERM_DISCOUNT_BPS: Record<number, number> = {
  1: 0,
  3: 1_500,
  6: 3_500,
  12: 6_000,
};

/** Terms offered at checkout. */
export const PLAN_MONTHS = [1, 3, 6, 12] as const;

export type PlanMonths = (typeof PLAN_MONTHS)[number];

export type Price = {
  months: number;
  /** months × monthly rate, before discount. */
  subtotalCents: number;
  /** 0 for a one-month term. */
  discountCents: number;
  /** What the investor actually pays. */
  totalCents: number;
  /** Effective per-month cost, for "works out at $X/mo" copy. */
  perMonthCents: number;
  discountBps: number;
};

export function isPlanMonths(value: number): value is PlanMonths {
  return (PLAN_MONTHS as readonly number[]).includes(value);
}

export function priceFor(months: number): Price {
  if (!Number.isInteger(months) || months < 1) {
    throw new Error(`Invalid subscription term: ${months}`);
  }

  const subtotalCents = MONTHLY_PRICE_CENTS * months;
  // Unknown term -> no discount. Falling back to the nearest listed rate
  // would quietly invent a price, and this function is what checkout charges.
  const discountBps = TERM_DISCOUNT_BPS[months] ?? 0;

  // Round the discount down so rounding never favours us over the investor.
  const discountCents = Math.floor((subtotalCents * discountBps) / 10_000);
  const totalCents = subtotalCents - discountCents;

  return {
    months,
    subtotalCents,
    discountCents,
    totalCents,
    perMonthCents: Math.round(totalCents / months),
    discountBps,
  };
}

export const PLANS: Price[] = PLAN_MONTHS.map(priceFor);

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  // Whole dollars are the common case at these price points; don't show ".00".
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}
