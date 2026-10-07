import { createClient } from "@/lib/supabase/server";

/**
 * A2 — admin identity and permissions.
 *
 * Every check asks the database, through the same admin_has() that the RLS
 * policies use. One implementation, so the UI and the data layer cannot
 * disagree about who may do what — and so hiding a button is never mistaken
 * for taking the permission away.
 */

export const PERMISSIONS = [
  "users.view",
  "users.edit",
  "users.disable",
  "users.delete",
  "bot.view",
  "bot.configure",
  "finance.view",
  "admins.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type AdminIdentity = {
  userId: string;
  email: string | null;
  role: string;
  isSuper: boolean;
  mustChangePassword: boolean;
  permissions: Permission[];
};

/** The signed-in admin, or null. Disabled admins are not admins. */
export async function getAdmin(): Promise<AdminIdentity | null> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("app_admins")
    .select("role, must_change_password, disabled_at, admin_roles(permissions, is_super)")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !data || data.disabled_at) return null;

  const role = data.admin_roles as unknown as {
    permissions: string[];
    is_super: boolean;
  } | null;

  const isSuper = role?.is_super === true;

  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    role: data.role,
    isSuper,
    mustChangePassword: data.must_change_password,
    // Super admin holds everything, including permissions no role lists.
    permissions: isSuper
      ? [...PERMISSIONS]
      : ((role?.permissions ?? []) as Permission[]),
  };
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdmin()) !== null;
}

export async function hasPermission(permission: Permission): Promise<boolean> {
  const admin = await getAdmin();
  return admin?.permissions.includes(permission) ?? false;
}

/**
 * The guard for server actions.
 *
 * Returns the admin or null — callers refuse on null. Deliberately not a throw:
 * an action that throws surfaces as a 500 the user cannot act on, while a
 * refusal can say "you do not have permission for that".
 *
 * While must_change_password is set, EVERY permission is refused. An account
 * whose password is written down in a spec should be able to do exactly one
 * thing, and that is change it.
 */
export async function requirePermission(
  permission: Permission,
): Promise<AdminIdentity | null> {
  const admin = await getAdmin();
  if (!admin) return null;
  if (admin.mustChangePassword) return null;
  if (!admin.permissions.includes(permission)) return null;
  return admin;
}

/**
 * Records an admin action. Called by the actions themselves, as the signed-in
 * user, so the actor comes from the session rather than from an argument
 * somebody could set.
 */
export async function recordAdminAction(
  action: string,
  target: { type?: string; id?: string } = {},
  detail?: Record<string, unknown>,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("record_admin_action", {
    p_action: action,
    p_target_type: target.type ?? null,
    p_target_id: target.id ?? null,
    p_detail: detail ? JSON.parse(JSON.stringify(detail)) : null,
  });

  // Logged, never thrown. A failed audit write must not roll back the action
  // it was describing — but it must be loud, because an action nobody can
  // account for is the thing audit exists to prevent.
  if (error) console.error("[admin] audit write failed:", action, error.message);
}
