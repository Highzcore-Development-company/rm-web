import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { envOr } from "@/lib/env";

/**
 * A WRITE session on the bot's project, held as the ADMIN — not as a shared
 * account and not through an endpoint of ours.
 *
 * Why it has to work this way (Victor's ruling, and the grants back it up):
 *
 *   - the anon key gets 401 / affects zero rows on these tables. The column
 *     grants are to `authenticated`, so an UPDATE that is not signed in
 *     succeeds and changes nothing, which is worse than failing.
 *   - no shared operator login. `updated_by` is the audit answer to "who
 *     changed the lot size", and one shared account makes every answer the
 *     same useless string.
 *
 * So each admin signs in to rm-server with THEIR OWN rm-server credentials.
 * Victor provisions one account per admin; we never hold a password.
 *
 * WHAT WE STORE: the refresh token, in an httpOnly cookie, for this browser
 * session only. Not in the database. A long-lived bot credential sitting in
 * our tables is exactly the thing worth stealing, and a kill switch that
 * needs re-authenticating now and then is a feature rather than a chore.
 *
 * NOTE (migration 019): `updated_by` is write-only for `authenticated`. We can
 * set it; we cannot read it back. Nothing here should try.
 */

/*
 * THE BOT SESSION COOKIE IS GONE, with the sign-in that set it.
 *
 * There used to be an `rm_bot_session` cookie holding a refresh token for the
 * bot's project, so each admin could act on rm-server as themselves. Victor,
 * 16 Oct: "I don't need this 'Sign in to the bot to make changes', because the
 * bot shouldn't have a different login." Writes now go through the service key
 * and are attributed from the rm-web session — see the note on
 * getBotWriteClient below for what that trades away.
 *
 * Anyone still holding the old cookie is harmless: nothing reads it, and it is
 * scoped to /app where it will expire on its own.
 */

/** Writable columns, as granted. Anything outside this list will be refused. */
export const WRITABLE = {
  bot_symbol_config: [
    "lot_size",
    "close_at_profit",
    "enabled",
    "updated_at",
    "updated_by",
  ],
  bot_settings: [
    "trading_enabled",
    "require_approval",
    "cutover_at",
    "updated_at",
    "updated_by",
    // When the desk asked trading to switch itself back on, and who asked
    // (bot migration 024). The bot clears resume_at once it fires.
    "resume_at",
    "resume_by",
  ],
} as const;

/**
 * ONE USER, OURS. The bot's project does not get its own login.
 *
 * Victor's call, and it reverses the earlier ruling, so the reasoning on both
 * sides is worth keeping:
 *
 *   The earlier position was that each admin signs in to rm-server as
 *   themselves, so rm-server KNOWS who made a change rather than taking
 *   rm-web's word for it. That is a real property and this gives it up.
 *
 *   His position is that there is one set of admins, created on the front end,
 *   and permission is ours to decide. A second account per person to use a
 *   button in our own panel is a login nobody should be asked for — he was
 *   surprised to find one there at all.
 *
 * WHAT WE KEEP of the audit trail: every write still stamps updated_by and
 * created_by with the signed-in ADMIN's email from their rm-web session, and
 * every action is recorded in admin_audit here with who, when and to what. So
 * "who changed this lot size" is still answerable. What changes is that
 * rm-server now trusts rm-web's answer rather than establishing it itself.
 *
 * WHAT THAT COSTS, stated plainly because it is a real cost: a service key
 * bypasses RLS, so a bug on our side could reach anything in rm-server rather
 * than only the columns granted to `authenticated`. Everything that uses this
 * goes through requirePermission("bot.configure") first.
 *
 * Server-only. Never give this a NEXT_PUBLIC_ prefix.
 */
/**
 * The rm-server service key, under either name it is stored as.
 *
 * The bot's Supabase project is called two different things depending on which
 * codebase is talking about it. rm-web says RM_SERVER_*; highzcore says BOT_*.
 * They are the same project (ttpbkk…) — not the app project, which is wprdtd…
 * and whose key is plain SUPABASE_SERVICE_ROLE_KEY.
 *
 * The deploy stores it as BOT_SUPABASE_SERVICE_ROLE_KEY while this file read
 * RM_SERVER_SERVICE_ROLE_KEY, so hasServiceAccess() was false in production
 * and every admin write to the bot was a silent no-op with a perfectly good
 * key sitting in the project.
 *
 * Both names are accepted rather than one being renamed, because renaming the
 * live variable is a deploy that breaks the panel for as long as it takes
 * anyone to notice, and renaming in code breaks whoever set it the other way.
 * The deployed name wins.
 *
 * Server-only. Never give either a NEXT_PUBLIC_ prefix.
 */
function serviceRoleKey(): string {
  return (
    envOr(process.env.BOT_SUPABASE_SERVICE_ROLE_KEY, "") ||
    envOr(process.env.RM_SERVER_SERVICE_ROLE_KEY, "")
  );
}

function serviceUrl(): string {
  return (
    envOr(process.env.RM_SERVER_SUPABASE_URL, "") ||
    envOr(process.env.NEXT_PUBLIC_BOT_SUPABASE_URL, "")
  );
}

function serviceClient(): SupabaseClient | null {
  const url = serviceUrl();
  const key = serviceRoleKey();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Whether writes work without anybody signing in to the bot separately. */
export function hasServiceAccess(): boolean {
  return Boolean(serviceUrl() && serviceRoleKey());
}

/**
 * Can an admin change anything on the bot?
 *
 * ONE QUESTION, ONE ANSWER. The panel used to ask three — permission, is
 * rm-server reachable, has THIS admin signed in to it — and the third is the
 * one Victor threw out: "As long as you are an admin, I should be able to
 * change the settings... I don't need extra logins to do that."
 *
 * So this is now purely "is the server key configured". Permission is still
 * checked separately, by requirePermission, because that is a role decision of
 * ours rather than a second credential.
 */
export function canWriteToBot(): boolean {
  return hasServiceAccess();
}

/**
 * Why a write would be refused, or null when it would not be.
 *
 * Exists so the page can name the real cause. The thing it replaced told an
 * admin to "sign in to the bot", which was wrong twice over: there is nothing
 * to sign in to, and the actual problem is a variable missing from the
 * deployment — something no amount of clicking will fix, and something only
 * this message will tell anyone.
 */
export function writeBlockedReason(): "no_url" | "no_key" | null {
  if (!serviceUrl()) return "no_url";
  if (!serviceRoleKey()) return "no_key";
  return null;
}

/**
 * The write client, or null when the service key is not configured.
 *
 * THE PER-ADMIN FALLBACK IS GONE. It refreshed a bot refresh token out of an
 * httpOnly cookie, and with the sign-in form removed nothing could set that
 * cookie any more — so it was unreachable code holding the design Victor threw
 * out. Leaving it would also have left a long-lived bot credential in a cookie
 * for anyone still carrying one, which is the single most valuable thing an
 * attacker could take from this app. Dead and deleted beats dead and dormant.
 *
 * Null here is a DEPLOYMENT problem, not a user one. Nothing an admin clicks
 * will fix it; see writeBlockedReason, which is what the page shows instead.
 */
export async function getBotWriteClient(): Promise<SupabaseClient | null> {
  return serviceClient();
}

/** Whether rm-server is configured at all, regardless of who is signed in. */
export function isBotReachable(): boolean {
  return Boolean(
    envOr(process.env.RM_SERVER_SUPABASE_URL, "") &&
      envOr(process.env.RM_SERVER_SUPABASE_ANON_KEY, ""),
  );
}

/**
 * Cut someone's access to the BOT, not just to our panel.
 *
 * The gap this closes: rm-web and rm-server revoke separately. Removing
 * somebody as an admin here left their rm-server account working, so they lost
 * the dashboard and kept the ability to close live trades and change lot
 * sizes — until a human remembered to go and disable them in a different
 * system. That is the kind of gap that surfaces on the worst possible day.
 *
 * Disabled, never deleted (migration 021 grants no delete at all): old
 * bot_commands.created_by rows have to stay attributable to a real person.
 *
 * Returns false when it could not be done — no rm-server session, or the write
 * was refused. The caller must NOT report a clean removal in that case: a
 * revocation that looks complete and is not is worse than one that failed
 * loudly.
 */
export async function revokeBotAdmin(email: string): Promise<boolean> {
  const client = await getBotWriteClient();
  if (!client) return false;

  const { data, error } = await client
    .from("bot_admins")
    .update({ disabled_at: new Date().toISOString() })
    .eq("email", email.toLowerCase())
    .is("disabled_at", null)
    .select("email");

  if (error) {
    console.error("[rm-server] revoke failed:", error.message);
    return false;
  }

  // Zero rows is success here, unlike every other write: it means they were
  // never a bot admin, or were already disabled. Either way they hold nothing.
  return Array.isArray(data);
}
