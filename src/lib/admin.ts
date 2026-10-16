import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PERMISSIONS, isPermission, type Permission } from "@/lib/permissions";

/**
 * A2 — admin identity and permissions.
 *
 * Every check asks the database, through the same admin_has() that the RLS
 * policies use. One implementation, so the UI and the data layer cannot
 * disagree about who may do what — and so hiding a button is never mistaken
 * for taking the permission away.
 */

// Defined in lib/permissions.ts, which has no imports — this module reaches
// for next/headers through the server Supabase client, and the invite form is
// a client component that needs the list. Re-exported so every existing
// importer is unaffected.
export { PERMISSIONS, isPermission, type Permission } from "@/lib/permissions";

export type AdminIdentity = {
  userId: string;
  email: string | null;
  /** From the profile captured on their invitation. Null for older rows. */
  fullName: string | null;
  role: string;
  isSuper: boolean;
  mustChangePassword: boolean;
  permissions: Permission[];
  /** From the auth system. The idempotency key for the login log. */
  lastSignInAt: string | null;
};

/** The signed-in admin, or null. Disabled admins are not admins. */
export async function getAdmin(): Promise<AdminIdentity | null> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  /**
   * THE PROFILE COLUMNS ARE OPTIONAL, and this is not defensiveness for its own
   * sake — it locked the whole panel out once already.
   *
   * Asking for `extra_permissions` and `full_name` before migration
   * 20261016190000 has been applied makes PostgREST refuse the whole select.
   * That error lands in the `return null` below, which means "not an admin",
   * which means the layout 404s — so shipping the code a few minutes before
   * running the SQL takes every admin's access away, including the access
   * needed to work out why.
   *
   * So the new columns are asked for, and a failure falls back to the select
   * that has always worked. An admin then simply has no name and no extra
   * permissions until the migration lands, which is exactly right: those are
   * additions, and nothing that existed before depends on them.
   */
  const BASE =
    "role, must_change_password, disabled_at, accepted_at, email_verified_at, admin_roles(permissions, is_super)";

  const query = (columns: string) =>
    supabase
      .from("app_admins")
      .select(columns)
      .eq("user_id", auth.user.id)
      .maybeSingle();

  type Row = {
    role: string;
    must_change_password: boolean;
    disabled_at: string | null;
    accepted_at: string | null;
    email_verified_at: string | null;
    extra_permissions?: string[] | null;
    full_name?: string | null;
    admin_roles: { permissions: string[]; is_super: boolean } | null;
  };
  type Result = { data: Row | null; error: { message: string } | null };

  let { data, error } = (await query(
    `${BASE}, extra_permissions, full_name`,
  )) as unknown as Result;

  if (error) {
    ({ data, error } = (await query(BASE)) as unknown as Result);
    if (!error) {
      console.warn(
        "[admin] profile columns missing — run migration 20261016190000_admin_profiles.sql",
      );
    }
  }

  if (error || !data || data.disabled_at) return null;

  // Staff identity stands on its own: app_admins carries accepted_at and
  // email_verified_at, so a colleague needs no investors row. Before this,
  // every admin had to be a customer, which is why staff showed up in the
  // user list indistinguishable from people paying us.
  //
  // Both are required. Invited-but-not-accepted holds nothing, and an address
  // nobody has proved they can read is not an identity — sign-up is
  // auto-confirmed, so Supabase's own flag proves nothing here.
  //
  // Mirrors is_admin() in 20261008120000_staff_accounts.sql. If one changes,
  // change both.
  if (!data.accepted_at || !data.email_verified_at) return null;

  const role = data.admin_roles;

  const isSuper = role?.is_super === true;

  /**
   * The role's permissions, plus anything granted to this person directly.
   *
   * THE SAME UNION admin_has() DOES in the database (migration
   * 20261016190000). If only one of them knew about extra_permissions, a
   * button would appear for something the database would still refuse — which
   * is the worst of both, because it looks like a bug in the feature rather
   * than in the permission.
   *
   * Additive only. A role that cannot be trusted to mean what it says is a
   * role to change, not one to subtract from per person.
   */
  const extra = ((data.extra_permissions ?? []) as string[]).filter(isPermission);

  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    fullName: (data.full_name as string | null) ?? null,
    role: data.role,
    isSuper,
    mustChangePassword: data.must_change_password,
    lastSignInAt: auth.user.last_sign_in_at ?? null,
    // Super admin holds everything, including permissions no role lists.
    permissions: isSuper
      ? [...PERMISSIONS]
      : [...new Set([...((role?.permissions ?? []) as Permission[]), ...extra])],
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

/**
 * Record that this staff member signed in.
 *
 * Keyed on auth.users.last_sign_in_at rather than "now", which makes it
 * idempotent for free: twenty page loads inside one session all carry the same
 * timestamp and collide on the unique constraint, so the row is written once
 * per actual sign-in. Writing "now" on every request would turn a login log
 * into a page-view log and tell nobody anything.
 *
 * Deliberately never throws and never blocks. This is an audit convenience,
 * and a logging failure must not be able to keep staff out of the panel.
 */
export async function recordAdminLogin(
  userId: string,
  lastSignInAt: string | null,
): Promise<void> {
  if (!lastSignInAt) return;

  try {
    const service = createServiceClient();

    const { error } = await service
      .from("admin_logins")
      .insert({ user_id: userId, signed_in_at: lastSignInAt });

    // Conflict means this sign-in is already recorded — the common case on
    // every page load after the first. Nothing to do, and not an error.
    if (error) return;

    // Only reached on a genuinely new sign-in, so the counter counts logins.
    const { data: current } = await service
      .from("app_admins")
      .select("login_count")
      .eq("user_id", userId)
      .maybeSingle();

    await service
      .from("app_admins")
      .update({
        last_login_at: lastSignInAt,
        last_seen_at: new Date().toISOString(),
        login_count: (current?.login_count ?? 0) + 1,
      })
      .eq("user_id", userId);
  } catch (err) {
    console.error("[admin] could not record login:", err);
  }
}
