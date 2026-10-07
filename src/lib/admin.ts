import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";

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

  if (data !== true) return false;

  // Sign-up is auto-confirmed, so the bootstrap address is an admin the moment
  // it registers, before anyone has proved they own the inbox. Our own
  // verification flag has to hold as well.
  const investor = await getInvestor(supabase);
  return Boolean(investor?.email_verified_at);
}
