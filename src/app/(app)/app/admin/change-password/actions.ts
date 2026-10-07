"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAdmin } from "@/lib/admin";

export type ChangeResult = { ok: true } | { ok: false; error: string };

/** Long enough that the seeded nine digits cannot simply be re-entered. */
const MIN_LENGTH = 12;

const SEEDED = "123456789";

/**
 * A1 — the forced password change.
 *
 * Deliberately the one action an admin can take while must_change_password is
 * set. requirePermission refuses everything else until this has run.
 */
export async function changeAdminPassword(
  password: string,
  confirm: string,
): Promise<ChangeResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "not_admin" };

  if (password.length < MIN_LENGTH) return { ok: false, error: "too_short" };
  if (password !== confirm) return { ok: false, error: "mismatch" };

  // The seeded password is public. Refusing it by name is blunt, and blunt is
  // right: the entire point of this screen is that it stops being usable.
  if (password.trim() === SEEDED) return { ok: false, error: "seeded" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[admin] password change failed:", error.message);
    return { ok: false, error: "generic" };
  }

  // Service role: must_change_password is not a column an admin may write,
  // precisely because clearing it is what unlocks everything else.
  const { error: clearError } = await createServiceClient()
    .from("app_admins")
    .update({ must_change_password: false })
    .eq("user_id", admin.userId);

  if (clearError) {
    console.error("[admin] could not clear the flag:", clearError.message);
    return { ok: false, error: "generic" };
  }

  // Recorded after the fact, and never allowed to fail the change itself.
  await supabase.rpc("record_admin_action", {
    p_action: "admin.password_changed",
    p_target_type: "admin",
    p_target_id: admin.userId,
    p_detail: null,
  });

  return { ok: true };
}
