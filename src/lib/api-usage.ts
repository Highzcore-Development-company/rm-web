import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * P2-607 — call volume for the signed-in developer's keys.
 *
 * Lives here rather than in the page because it reads the clock, and a
 * component body must stay pure — `Date.now()` in render is both a lint error
 * and a real source of values that change between renders.
 *
 * No investor filter: RLS already scopes api_usage to rows belonging to the
 * caller's own keys, so there is no predicate here to forget.
 */
export async function callsInLast24Hours(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("api_usage")
    .select("calls")
    .gte("window_start", since);

  if (error) {
    console.error("[api-usage] read failed:", error);
    return 0;
  }

  return ((data ?? []) as { calls: number }[]).reduce(
    (total, row) => total + row.calls,
    0,
  );
}
