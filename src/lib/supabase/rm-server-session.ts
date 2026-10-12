import { cookies } from "next/headers";
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

const COOKIE = "rm_bot_session";

/**
 * How long a bot session lasts, in seconds.
 *
 * Without this it was a SESSION cookie — gone when the browser closed, so an
 * operator re-entered their rm-server password several times a day. That is
 * not security, it is friction that trains people to pick a shorter password.
 *
 * Thirty days, and the exposure is smaller than it looks: the cookie is
 * httpOnly, scoped to /app/admin, and useless without an rm-web admin session
 * to reach that path at all. The refresh token also rotates on every use, so a
 * stale copy stops working as soon as the real one is used.
 */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

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
  ],
} as const;

function anonClient(): SupabaseClient | null {
  const url = envOr(process.env.RM_SERVER_SUPABASE_URL, "");
  const anonKey = envOr(process.env.RM_SERVER_SUPABASE_ANON_KEY, "");
  if (!url || !anonKey) return null;

  // persistSession off: we move the refresh token ourselves, into a cookie
  // scoped to this app. Letting the SDK manage storage on the server would
  // share one session between every admin hitting the same process.
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type BotSessionResult =
  | { ok: true; email: string }
  | { ok: false; error: "unconfigured" | "bad_credentials" };

/** Sign this admin in to rm-server and keep the session for their browser. */
export async function startBotSession(
  email: string,
  password: string,
): Promise<BotSessionResult> {
  const client = anonClient();
  if (!client) return { ok: false, error: "unconfigured" };

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    // Not logged with the message attached: this runs on a form an admin can
    // retry, and provider text has a habit of ending up on screen.
    console.error("[rm-server] admin sign-in refused");
    return { ok: false, error: "bad_credentials" };
  }

  const jar = await cookies();
  jar.set(COOKIE, data.session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/app/admin",
    maxAge: SESSION_MAX_AGE,
  });

  return { ok: true, email: data.user?.email ?? email };
}

export async function endBotSession(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: COOKIE, path: "/app/admin" });
}

/**
 * NO SERVICE-KEY PATH, deliberately, and this is Victor's ruling with a
 * better reason than the convenience I offered against it.
 *
 * I proposed giving rm-web rm-server's service key so nobody had to sign in
 * twice. He refused, and the argument is about the AUDIT TRAIL rather than
 * blast radius: today rm-server knows who made a change because that person
 * signed in to it. With a service key, rm-web merely CLAIMS who made it. A
 * compromise of rm-web would then make the trail lie while still looking
 * complete, which is worse than having no trail at all.
 *
 * So the helper is gone rather than left dormant behind an unset variable —
 * a path nobody intends to use is one somebody eventually enables.
 */

/** Whether this admin has a live rm-server session. Cheap — no network. */
export async function hasBotSession(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(COOKIE)?.value);
}

/**
 * The write client, or null if this admin has not connected.
 *
 * Refreshing rotates the token, so the cookie is rewritten. When it is
 * rejected — revoked, expired, Victor deleted the account — the cookie is
 * cleared so the page offers the sign-in again instead of failing silently
 * every time somebody touches a control.
 */
export async function getBotWriteClient(): Promise<SupabaseClient | null> {
  const jar = await cookies();
  const refreshToken = jar.get(COOKIE)?.value;
  if (!refreshToken) return null;

  const client = anonClient();
  if (!client) return null;

  const { data, error } = await client.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    jar.delete({ name: COOKIE, path: "/app/admin" });
    return null;
  }

  jar.set(COOKIE, data.session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/app/admin",
    maxAge: SESSION_MAX_AGE,
  });

  return client;
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
