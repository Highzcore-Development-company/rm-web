"use server";

import { revalidatePath } from "next/cache";
import { recordAdminAction, requirePermission } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { isEmailConfigured, sendEmail, staffInviteEmail } from "@/lib/email";
import { envOr } from "@/lib/env";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
} from "@/lib/staff-invite";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

/**
 * A2 — managing who is an admin.
 *
 * INVITATION IS THE ONLY WAY IN. There is deliberately no way to make someone
 * an admin directly: you enter their email, they receive a link, and THEY
 * choose to accept it. Nobody acquires access to other people's money and a
 * kill switch without an action of their own, and accepting the emailed link
 * is also what proves they own the address.
 *
 * Being in-house does not make somebody an admin. Most colleagues never need
 * to be one — a social media manager has no business in this panel — so there
 * is no automatic promotion from "works here" to "is an admin".
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

/**
 * Invite someone to be staff.
 *
 * Replaces the old "promote an existing account" flow as the primary route in.
 * The difference matters: promotion required the person to already be a
 * CUSTOMER, because staff used to need an investors row. They no longer do, so
 * an invitation can reach somebody who has never signed up — which is what
 * inviting a colleague actually looks like.
 *
 * Nobody becomes staff by registering. The invite names the role, expires, and
 * is the only thing that can create the app_admins row.
 */
export async function inviteStaff(
  email: string,
  role: string,
): Promise<AdminActionResult> {
  const actor = await requirePermission("admins.manage");
  if (!actor) return { ok: false, error: "forbidden" };

  if (!isEmailConfigured()) return { ok: false, error: "email_not_configured" };

  const address = email.trim().toLowerCase();
  if (!address.includes("@")) return { ok: false, error: "bad_email" };

  const service = createServiceClient();

  const { data: roleRow } = await service
    .from("admin_roles")
    .select("name, label, is_super")
    .eq("name", role)
    .maybeSingle();

  if (!roleRow) return { ok: false, error: "unknown_role" };
  if (roleRow.is_super && !actor.isSuper) {
    return { ok: false, error: "super_only" };
  }

  // Already staff? Then this is a role change, not an invitation, and sending
  // one would imply their access depends on clicking it.
  const existing = await findUserByEmail(address);
  if (existing) {
    const { data: already } = await service
      .from("app_admins")
      .select("user_id")
      .eq("user_id", existing.id)
      .maybeSingle();
    if (already) return { ok: false, error: "already_admin" };
  }

  const token = generateInviteToken();
  const expiresAt = inviteExpiry();

  const { error } = await service.from("admin_invitations").insert({
    email: address,
    role,
    token_hash: hashInviteToken(token),
    invited_by: actor.userId,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    // The partial unique index allows one LIVE invitation per address, so a
    // conflict here means one is already outstanding. Revoke it to reissue —
    // otherwise two valid links with different roles could both be clicked.
    console.error("[admin/admins] invite failed:", error.message);
    return { ok: false, error: "invite_exists" };
  }

  try {
    await sendEmail({
      to: address,
      ...staffInviteEmail({
        invitedBy: actor.email ?? "An administrator",
        roleLabel: roleRow.label as string,
        acceptUrl: inviteUrl(
          envOr(process.env.NEXT_PUBLIC_SITE_URL, "https://highzcore.com"),
          token,
        ),
        expiresAt,
      }),
    });
  } catch (err) {
    // The row exists but the mail did not go. Revoke it rather than leave an
    // invitation nobody can see but which blocks reissuing to this address.
    console.error("[admin/admins] invite email failed:", err);
    await service
      .from("admin_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashInviteToken(token));
    return { ok: false, error: "email_failed" };
  }

  await recordAdminAction("admin.invited", { type: "admin" }, {
    email: address,
    role,
  });

  revalidatePath("/app/admin/admins");
  return { ok: true };
}

/** Withdraw an invitation that has not been accepted. */
export async function revokeInvite(id: string): Promise<AdminActionResult> {
  const actor = await requirePermission("admins.manage");
  if (!actor) return { ok: false, error: "forbidden" };

  const { error } = await createServiceClient()
    .from("admin_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("accepted_at", null);

  if (error) {
    console.error("[admin/admins] revoke failed:", error.message);
    return { ok: false, error: "generic" };
  }

  await recordAdminAction("admin.invite_revoked", { type: "admin", id });

  revalidatePath("/app/admin/admins");
  return { ok: true };
}
