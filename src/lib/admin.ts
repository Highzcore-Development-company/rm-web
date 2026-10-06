import { createClient } from "@/lib/supabase/server";

/**
 * Whether the signed-in user is an admin.
 *
 * Reads public.users.role — the same column the database's is_admin() reads.
 * Deliberately not a second source of truth: if this said yes and the policy
 * said no, every admin screen would render and every query behind it would
 * come back empty, which looks like a bug rather than a permission.
 *
 * As noted in db/migrations/README.md, this means a highzcore.tech admin is an
 * admin here too. One company, one admin group.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  return data?.role === "admin";
}
