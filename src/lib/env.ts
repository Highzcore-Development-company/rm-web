/**
 * Environment variables, where "set to nothing" means "not set".
 *
 * `process.env.X ?? fallback` only falls back on undefined. A variable present
 * in .env.local with an empty value is a string, so the fallback never runs and
 * the empty string wins.
 *
 * That is not theoretical. `ALATPAY_API_BASE=` turned the payment endpoint into
 * a relative path and every checkout failed with "Failed to parse URL".
 * `NEXT_PUBLIC_VANTAGE_PARTNER_LINK=` gave the "Open a Vantage account" button
 * an empty href, which looks fine and goes nowhere.
 *
 * A key left blank in a template is the normal state of a half-configured
 * environment, so that is the case the helper has to handle.
 */

export function envOr(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function envNumberOr(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  const parsed = Number(trimmed);
  // Number("") is 0 and Number("abc") is NaN. Neither should quietly become a
  // rate limit or a confirmation count.
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Null when unset, for values with no sensible default. */
export function envOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
