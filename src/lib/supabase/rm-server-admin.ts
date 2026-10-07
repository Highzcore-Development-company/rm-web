import { createClient } from "@supabase/supabase-js";

/**
 * A WRITE client for the bot's project.
 *
 * The problem this solves: the bot grants UPDATE on bot_symbol_config and
 * bot_settings to `authenticated`. Our admins are authenticated in rm-web,
 * which is a different Supabase project — an rm-web session means nothing to
 * rm-server. So the panel cannot simply pass the admin's own token along.
 *
 * It signs in to rm-server as one dedicated operator account whose credentials
 * live in rm-web's server environment. Three things make that acceptable:
 *
 *   - it is SERVER-ONLY, behind a permission check; nothing reaches a browser
 *   - it holds exactly what the bot granted `authenticated`, which is four
 *     columns on two tables — not a service-role key, and it cannot write a
 *     trade or read anything the anon key could not already read
 *   - WHO changed a setting is recorded in rm-web's audit trail and written
 *     into bot_settings.updated_by, so "the operator account did it" is never
 *     the end of the answer
 *
 * The alternative was rm-server's service role key, which would let a bug here
 * rewrite the bot's entire database. This is the smaller blast radius.
 *
 * Returns null when unconfigured, so A8 degrades to read-only rather than
 * throwing on a page an admin is trying to use.
 */

export type RmServerWriteClient = NonNullable<
  Awaited<ReturnType<typeof createRmServerWriteClient>>
>;

export async function createRmServerWriteClient() {
  const url = process.env.RM_SERVER_SUPABASE_URL;
  const anonKey = process.env.RM_SERVER_SUPABASE_ANON_KEY;
  const email = process.env.RM_SERVER_OPERATOR_EMAIL;
  const password = process.env.RM_SERVER_OPERATOR_PASSWORD;

  if (!url || !anonKey || !email || !password) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    // Logged loudly: a panel that silently cannot write looks identical to one
    // where the bot is ignoring its settings.
    console.error("[rm-server] operator sign-in failed:", error.message);
    return null;
  }

  return client;
}

/** Whether the bot can be configured from here at all. */
export function isBotConfigurable(): boolean {
  return Boolean(
    process.env.RM_SERVER_OPERATOR_EMAIL &&
      process.env.RM_SERVER_OPERATOR_PASSWORD,
  );
}
