import type { Subscription } from "@/lib/supabase/types";
import { envNumberOr } from "@/lib/env";

/**
 * P2-311 — expiry handling.
 *
 * What an expired subscription costs you, and what it does not. The rule from
 * the brief: on expiry the investor keeps read access but is flagged for MAM
 * detachment.
 *
 * Read access survives because the alternative is punitive and useless — their
 * trade history is a record of what happened to their own money, and locking
 * them out of it does not make them more likely to pay. What stops is us
 * trading their account.
 */

/** Grace period after expiry before detachment is flagged. Victor's call. */
export const GRACE_PERIOD_DAYS = Number(
  envNumberOr(process.env.NEXT_PUBLIC_GRACE_PERIOD_DAYS, 3),
);

const DAY_MS = 24 * 60 * 60 * 1000;

export type Entitlement = {
  /** Latest expiry across confirmed payments. Null means never paid. */
  expiresAt: Date | null;
  /** Paid up right now. */
  active: boolean;
  /** Expired, but inside the grace period. Still traded. */
  inGrace: boolean;
  /** Past grace. Flagged for detachment from the MAM. */
  lapsed: boolean;
  /** Negative once expired. */
  daysRemaining: number | null;
  /** P2-310 sends at 7 days and 1 day. */
  reminderDue: 7 | 1 | null;
};

/**
 * Derived from the confirmed payments, never from a stored flag. A stored
 * "is_active" column is a second source of truth that drifts the first time a
 * job fails to run — and it drifts in the direction of trading an account
 * nobody is paying for.
 */
export function entitlementFrom(
  subscriptions: Subscription[],
  now: Date = new Date(),
): Entitlement {
  const expiries = subscriptions
    .filter((s) => s.status === "confirmed" && s.expires_at)
    .map((s) => new Date(s.expires_at as string).getTime());

  if (expiries.length === 0) {
    return {
      expiresAt: null,
      active: false,
      inGrace: false,
      lapsed: true,
      daysRemaining: null,
      reminderDue: null,
    };
  }

  const expiresAt = new Date(Math.max(...expiries));
  const msLeft = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.floor(msLeft / DAY_MS);

  const active = msLeft > 0;
  const inGrace = !active && msLeft > -GRACE_PERIOD_DAYS * DAY_MS;

  return {
    expiresAt,
    active,
    inGrace,
    lapsed: !active && !inGrace,
    daysRemaining,
    // Fires on the day itself, not "7 or fewer" — otherwise a daily job emails
    // the same person every day for a week.
    reminderDue: daysRemaining === 7 ? 7 : daysRemaining === 1 ? 1 : null,
  };
}

/**
 * Whether the bot should be trading this account.
 *
 * The single question the whole billing system exists to answer. Grace counts
 * as yes: cutting someone off the hour their card fails, mid-position, is a
 * worse outcome for them than three days of unpaid access is for us.
 */
export function shouldTrade(entitlement: Entitlement): boolean {
  return entitlement.active || entitlement.inGrace;
}
