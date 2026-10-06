import { createClient } from "@/lib/supabase/server";

/**
 * Whether the signed-in user is an admin.
 *
 * Asks the database's own is_admin() rather than reading app_admins directly,
 * so this and every RLS policy answer from one implementation. If these could
 * disagree, an admin screen would render and every query behind it would come
 * back empty — which looks like a bug rather than a permission.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;

  const { data, error } = await supabase.rpc("is_admin");
  if (error) {
    console.error("[admin] is_admin() failed:", error);
    return false;
  }

  return data === true;
}
