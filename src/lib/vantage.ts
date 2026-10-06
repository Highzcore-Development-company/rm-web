import { envNumberOr, envOr } from "@/lib/env";
/**
 * Vantage-side constants.
 *
 * Every value here is a placeholder until Victor's D1/D3 come back — the
 * partner link, the manager ID and the minimum all depend on the master
 * account existing under the right entity. They are collected in one file so
 * that when the real values arrive it is one edit, not a search.
 *
 * None of these are secrets: an IB link and a manager ID are published to
 * investors by design. They are env-overridable so staging and production can
 * point at different accounts without a deploy.
 */

/** Our Vantage IB link. Investors must open their account through this. */
export const PARTNER_LINK =
  envOr(
    process.env.NEXT_PUBLIC_VANTAGE_PARTNER_LINK,
    "https://www.vantagemarkets.com/",
  );

/** The MAM manager ID an investor attaches their account to. */
export const MANAGER_ID = envOr(process.env.NEXT_PUBLIC_VANTAGE_MANAGER_ID, "TBC");

/** Vantage's own account minimum, in whole USD. */
export const BROKER_MINIMUM_USD = Number(
  envNumberOr(process.env.NEXT_PUBLIC_VANTAGE_MINIMUM_USD, 200),
);

/**
 * Our practical minimum (P2-206). Higher than the broker's, and that gap is
 * the point: an account can satisfy Vantage and still be too small for our lot
 * sizes to mean anything. At the smallest size the bot trades, a balance below
 * this takes a drawdown that would be routine on a larger account and turns it
 * into a margin call.
 *
 * TODO(Victor): set from the actual minimum lot size and worst-case drawdown.
 */
export const RECOMMENDED_MINIMUM_USD = Number(
  envNumberOr(process.env.NEXT_PUBLIC_RECOMMENDED_MINIMUM_USD, 1000),
);

/**
 * MT5 logins are numeric. Matches the constraint in
 * db/migrations/p2_001_investors.sql — if one changes, change both, or the
 * form will accept something the database then rejects.
 */
export const MT5_LOGIN_PATTERN = /^[0-9]{4,15}$/;

export function isValidMt5Login(value: string): boolean {
  return MT5_LOGIN_PATTERN.test(value.trim());
}
