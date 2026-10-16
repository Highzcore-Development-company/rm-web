"use server";

import { revalidatePath } from "next/cache";
import { getAdmin, recordAdminAction, requirePermission } from "@/lib/admin";
import { isPermission } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";
import type { AppAdmin } from "@/lib/supabase/types";

export type ProfileResult = { ok: true } | { ok: false; error: string };

/**
 * The fields a profile is made of.
 *
 * Permissions are NOT here. They travel on their own path, for the reason
 * given on updateAdminProfile.
 */
export type ProfileFields = {
  fullName?: string;
  jobTitle?: string;
  phone?: string;
  gender?: string;
  city?: string;
  state?: string;
  country?: string;
  notes?: string;
};

/** Empty string means "cleared", which is null — not "". */
function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function columns(fields: ProfileFields) {
  return {
    full_name: clean(fields.fullName),
    job_title: clean(fields.jobTitle),
    phone: clean(fields.phone),
    gender: clean(fields.gender),
    city: clean(fields.city),
    state: clean(fields.state),
    country: clean(fields.country),
    notes: clean(fields.notes),
  };
}

/**
 * Edit your own profile.
 *
 * ANY ADMIN MAY DO THIS, and it needs no permission beyond being one — these
 * are your own name and city. The guard is simply that `getAdmin()` resolved,
 * and the row written is the one for the session, never an id from the caller.
 *
 * NOTE WHAT IS ABSENT: role, and extra_permissions. A self-service form that
 * could raise its own permissions is not a form, it is a privilege escalation
 * with a nice layout — and it would not even need an attacker, just a
 * mis-click on a page everybody can reach. Those live on
 * updateAdminProfile, behind admins.manage, which by definition the person
 * changing themselves does not satisfy on their own behalf.
 */
export async function updateMyProfile(
  fields: ProfileFields,
): Promise<ProfileResult> {
  const me = await getAdmin();
  if (!me) return { ok: false, error: "forbidden" };
  // Same rule as every other action: while a seeded password stands, the only
  // thing this account may do is change it.
  if (me.mustChangePassword) return { ok: false, error: "forbidden" };

  const service = createServiceClient();
  const { data, error } = await service
    .from("app_admins")
    .update(columns(fields))
    .eq("user_id", me.userId)
    .select("user_id");

  if (error || !data?.length) {
    console.error("[admin/profile] self update failed:", error?.message);
    return { ok: false, error: "failed" };
  }

  await recordAdminAction("admin.profile_updated", {
    type: "admin",
    id: me.userId,
  });

  revalidatePath("/app/admin/profile");
  revalidatePath("/app/admin/admins");
  return { ok: true };
}

/**
 * Edit somebody else's profile, and optionally what they may do.
 *
 * Victor: "I should also do same for other admins." Behind admins.manage,
 * which is the permission that already governs inviting, disabling and
 * removing — changing a colleague's details and access belongs with those
 * rather than with editing your own name.
 *
 * EXTRA PERMISSIONS ARE OPTIONAL in the argument, and `undefined` means "leave
 * them alone". An empty array means "take them all away", and the two must not
 * be confused: a form that submits only the profile fields would otherwise
 * silently strip somebody's permissions every time their phone number changed.
 *
 * The ROLE is not here either. It has its own action, its own dropdown and its
 * own super-admin guard (setAdminRole), and routing it through a profile form
 * would mean two code paths able to grant a role with only one of them
 * checking whether the actor may grant it.
 */
export async function updateAdminProfile(
  userId: string,
  fields: ProfileFields,
  extraPermissions?: string[],
): Promise<ProfileResult> {
  const actor = await requirePermission("admins.manage");
  if (!actor) return { ok: false, error: "forbidden" };

  const service = createServiceClient();

  // Typed as the row rather than a loose record, so a typo'd column name is a
  // compile error instead of an update that silently writes nothing.
  const patch: Partial<AppAdmin> = columns(fields);
  if (extraPermissions !== undefined) {
    // Only permissions we know. An unrecognised string would sit in the column
    // forever meaning nothing.
    patch.extra_permissions = extraPermissions.filter(isPermission);
  }

  const { data, error } = await service
    .from("app_admins")
    .update(patch)
    .eq("user_id", userId)
    .select("user_id");

  if (error || !data?.length) {
    console.error("[admin/profile] update failed:", error?.message);
    return { ok: false, error: "failed" };
  }

  await recordAdminAction("admin.profile_updated", { type: "admin", id: userId }, {
    name: clean(fields.fullName),
    ...(extraPermissions !== undefined
      ? { extra_permissions: patch.extra_permissions }
      : {}),
  });

  revalidatePath("/app/admin/admins");
  revalidatePath("/app/admin/profile");
  return { ok: true };
}
