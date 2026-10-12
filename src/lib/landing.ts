import type { AccountType } from "@/lib/supabase/types";

/**
 * Where an account belongs after signing in.
 *
 * HS-BOT-v4 §1: "A trader goes to the Scora desk. An investor goes to the
 * investor dashboard." One function so every entry point agrees — /app, the
 * login redirect and the auth callback all ask here rather than each deciding
 * for themselves, which is how two of them end up disagreeing.
 *
 * Both currently resolve to /app/dashboard, because §2 is what splits the
 * screen in two. Writing the helper now rather than later means the split
 * happens in one place when it lands, instead of being hunted for across
 * every redirect in the app.
 */
export function landingPathFor(accountType: AccountType | null): string {
  return accountType === "trader" ? "/app/dashboard" : "/app/dashboard";
}

/**
 * Whether this account sees Scora.
 *
 * Scora is what a TRADER buys. An investor's dashboard is the chart, their
 * trades and their performance — the bot does their analysis, so a chat panel
 * offering to analyse markets for them is selling them something they have
 * already declined.
 */
export function showsScora(accountType: AccountType | null): boolean {
  return accountType === "trader";
}
