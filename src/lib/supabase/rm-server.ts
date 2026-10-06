import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only client for the BOT's Supabase project (rm-server).
 *
 * rm-server is not ours. The bot owns its schema and changes it on its own
 * schedule; we read published figures out of it and write nothing, ever. If a
 * read here needs more access than the anon key has, the fix is a policy or a
 * view on rm-server — not a more powerful key on this side.
 *
 * Server-only. The env vars have no NEXT_PUBLIC_ prefix, so importing this
 * from a client component fails to build rather than shipping a key to every
 * visitor.
 *
 * Returns null when it is not configured, so every caller has to decide what
 * to render in that case. The performance page already has an unavailable
 * state; it should use it rather than crash.
 */
export function createRmServerClient() {
  const url = process.env.RM_SERVER_SUPABASE_URL;
  const key = process.env.RM_SERVER_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
