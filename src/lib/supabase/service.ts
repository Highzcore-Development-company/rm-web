import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { ServiceDatabase } from "./types";

/**
 * The service-role client. BYPASSES RLS ENTIRELY.
 *
 * Only for work that is genuinely not the user's: raising an invoice at a price
 * we calculated, banking a confirmed payment, running the chain watcher. Never
 * import this from a client component, and never use it to "fix" a permission
 * error — a permission error means the policy is wrong or the code is in the
 * wrong place.
 *
 * Every call site should be able to answer: why can this not be done as the
 * signed-in user?
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Server-only operations cannot run.",
    );
  }

  return createSupabaseClient<ServiceDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
