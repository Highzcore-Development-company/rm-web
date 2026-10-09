"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction, requirePermission } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

/**
 * A2 — managing who is an admin.
 *
 * ADDING IS PROMOTION, NOT CREATION. You cannot make an account for somebody
 * else here, on purpose. Creating one would mean choosing their password, and
 * the database now requires a verified email before any admin power works — a
 * verification only they can complete. So they sign up like anybody else, and
 * then they get promoted. The error says so plainly rather than failing with
 * "not found".
 *
 * Every function refuses to act on YOUR OWN row. Not paternalism: an admin who
 * demotes or deletes themselves has locked themselves out of the page that
 * would undo it, and if they were the last one holding admins.manage, nobody
 * can fix it without the service key. Someone else can always change your role.
 *
 * Super admins are protected in the DATABASE by trg_protect_super_admin, not
 * here. These checks are for the error message; the trigger is the rule.
 */

/**
 * Whether the target currently holds a super-admin role.
 *
 * Checked on every action that changes somebody else, because the obvious
 * guard — "is the role you are SETTING a super role?" — only stops promotion.
 * It does nothing about demotion, so without this a plain admin holding
 * admins.manage could set a super admin to `support` and take the company's
 * top account away from whoever owns it.
 *
 * The database trigger blocks deleting or disabling a super admin, but it
 * deliberately allows a role change (otherwise a super admin could never be
 * stepped down at all). That gap is this function's job.
 */
async function targetIsSuper(userId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("app_admins")
    .select("role, admin_roles!inner(is_super)")
    .eq("user_id", userId)
    .maybeSingle();

  const roles = (data as { admin_roles?: { is_super?: boolean } } | null)
    ?.admin_roles;
  return Boolean(roles?.is_super);
}

/** Look up a user by email. Null when nobody has signed up with it. */
async function findUserByEmail(email: string) {
  const service = createServiceClient();
  const target = email.trim().toLowerCase();
  if (!target) return null;

  // auth.users is not reachable through PostgREST, so this pages the admin
  // API. 200 at a time: this list is staff plus investors, not a mailing list,
  // and a company with more than a few thousand accounts can have a search box.
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    const found = users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (users.length < 200) break;
  }
  return null;
}

export async function addAdmin(
  email: string,
  role: string,
): Promise<AdminActionResult> {
  const actor = await requirePermission("admins.manage");
  if (!actor) return { ok: false, error: "forbidden" };

  const service = createServiceClient();

  // Only a super admin may create another one. Otherwise anyone holding
  // admins.manage could mint an account that outranks them and cannot be
  // disabled or deleted afterwards.
  const { data: roleRow } = await service
    .from("admin_roles")
    .select("name, is_super")
    .eq("name", role)
    .maybeSingle();

  if (!roleRow) return { ok: false, error: "unknown_role" };
  if (roleRow.is_super && !actor.isSuper) {
    return { ok: false, error: "super_only" };
  }

  const user = await findUserByEmail(email);
  if (!user) return { ok: false, error: "no_account" };

  const { data: investor } = await service
    .from("investors")
    .select("email_verified_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // Said here rather than letting them be added and then silently refused by
  // is_admin(). "I made them an admin and nothing works" is a worse half-hour
  // than "they need to verify first".
  if (!investor?.email_verified_at) {
    return { ok: false, error: "not_verified" };
  }

  const { error } = await service.from("app_admins").insert({
    user_id: user.id,
    role,
    // FALSE, deliberately. must_change_password exists for a password WE set —
    // a seeded or invited account whose password is known to someone else.
    // This person chose their own and we have never seen it, so forcing a
    // change is friction that buys nothing.
    must_change_password: false,
    created_by: actor.userId,
  });

  if (error) {
    // The unique constraint on user_id is the real check for "already an
    // admin"; reading first and then inserting would race.
    console.error("[admin/admins] add failed:", error.message);
    return { ok: false, error: "already_admin" };
  }

  await recordAdminAction("admin.added", { type: "admin", id: user.id }, {
    email: user.email,
    role,
  });

  revalidatePath("/app/admin/admins");
  return { ok: true };
}

export async function setAdminRole(
  userId: string,
  role: string,
): Promise<AdminActionResult> {
  const actor = await requirePermission("admins.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  if (userId === actor.userId) return { ok: false, error: "not_yourself" };

  // Only a super admin may act on another super admin, in either direction.
  if (!actor.isSuper && (await targetIsSuper(userId))) {
    return { ok: false, error: "super_only" };
  }

  const service = createServiceClient();

  const { data: roleRow } = await service
    .from("admin_roles")
    .select("name, is_super")
    .eq("name", role)
    .maybeSingle();

  if (!roleRow) return { ok: false, error: "unknown_role" };
  if (roleRow.is_super && !actor.isSuper) {
    return { ok: false, error: "super_only" };
  }

  const { error } = await service
    .from("app_admins")
    .update({ role })
    .eq("user_id", userId);

  if (error) {
    console.error("[admin/admins] role change failed:", error.message);
    return { ok: false, error: "generic" };
  }

  await recordAdminAction("admin.role_changed", { type: "admin", id: userId }, {
    role,
  });

  revalidatePath("/app/admin/admins");
  return { ok: true };
}

export async function setAdminDisabled(
  userId: string,
  disabled: boolean,
): Promise<AdminActionResult> {
  const actor = await requirePermission("admins.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  if (userId === actor.userId) return { ok: false, error: "not_yourself" };

  // Only a super admin may act on another super admin, in either direction.
  if (!actor.isSuper && (await targetIsSuper(userId))) {
    return { ok: false, error: "super_only" };
  }

  const { error } = await createServiceClient()
    .from("app_admins")
    .update(
      disabled
        ? { disabled_at: new Date().toISOString(), disabled_by: actor.userId }
        : { disabled_at: null, disabled_by: null, disabled_reason: null },
    )
    .eq("user_id", userId);

  if (error) {
    // Includes the super-admin trigger refusing. Its message is deliberately
    // not passed through — it is a database exception, not UI copy.
    console.error("[admin/admins] disable failed:", error.message);
    return { ok: false, error: "refused" };
  }

  await recordAdminAction(
    disabled ? "admin.disabled" : "admin.enabled",
    { type: "admin", id: userId },
  );

  revalidatePath("/app/admin/admins");
  return { ok: true };
}

/**
 * Remove admin rights. Does NOT touch their account.
 *
 * They keep their login, their investor row and their subscription — this
 * takes away the panel, nothing else. Deleting the person is a different
 * action on a different page, and conflating the two is how someone loses a
 * paying customer by removing a colleague.
 */
export async function removeAdmin(userId: string): Promise<AdminActionResult> {
  const actor = await requirePermission("admins.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  if (userId === actor.userId) return { ok: false, error: "not_yourself" };

  // Only a super admin may act on another super admin, in either direction.
  if (!actor.isSuper && (await targetIsSuper(userId))) {
    return { ok: false, error: "super_only" };
  }

  const { error } = await createServiceClient()
    .from("app_admins")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("[admin/admins] remove failed:", error.message);
    return { ok: false, error: "refused" };
  }

  await recordAdminAction("admin.removed", { type: "admin", id: userId });

  revalidatePath("/app/admin/admins");
  return { ok: true };
}
