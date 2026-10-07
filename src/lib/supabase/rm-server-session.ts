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
  });

  return { ok: true, email: data.user?.email ?? email };
}

export async function endBotSession(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: COOKIE, path: "/app/admin" });
}

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
