"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAdminAction, requirePermission } from "@/lib/admin";
import { isValidMt5Login } from "@/lib/vantage";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

/**
 * A5 — edit an investor.
 *
 * Editable: email, subscription expiry, linked account.
 *
 * NOT editable, and this is the point of the ticket: risk_acknowledged_at and
 * email_verified_at. Both are records that a PERSON did something. An admin
 * who can set them can manufacture evidence that somebody read a risk
 * disclosure they never saw, which is exactly the evidence we would be relying
 * on if that person later said they were never warned.
 */
export async function updateUser(
  investorId: string,
  changes: { email?: string; vantageAccountId?: string | null },
): Promise<AdminActionResult> {
  const admin = await requirePermission("users.edit");
  if (!admin) return { ok: false, error: "forbidden" };

  const service = createServiceClient();

  const { data: investor } = await service
    .from("investors")
    .select("user_id, vantage_account_id")
    .eq("id", investorId)
    .maybeSingle();

  if (!investor) return { ok: false, error: "not_found" };

  if (changes.email !== undefined) {
    const email = changes.email.trim().toLowerCase();
    if (!email.includes("@")) return { ok: false, error: "bad_email" };

    const { error } = await service.auth.admin.updateUserById(investor.user_id, {
      email,
    });
    if (error) {
      console.error("[admin/users] email change failed:", error.message);
      return { ok: false, error: "email_taken" };
    }

    await recordAdminAction("user.email_changed", {
      type: "investor",
      id: investorId,
    }, { to: email });
  }

  if (changes.vantageAccountId !== undefined) {
    const login = changes.vantageAccountId?.trim() || null;
    if (login && !isValidMt5Login(login)) {
      return { ok: false, error: "bad_login" };
    }

    const { error } = await service
      .from("investors")
      .update({
        vantage_account_id: login,
        // Clearing the login clears the confirmation with it. A linked_at
        // pointing at an account that is no longer there is a lie the admin
        // screens would then repeat.
        linked_at: login ? undefined : null,
      })
      .eq("id", investorId);

    if (error) {
      // 23505: the login belongs to someone else.
      return {
        ok: false,
        error: error.code === "23505" ? "login_taken" : "generic",
      };
    }

    await recordAdminAction("user.broker_account_changed", {
      type: "investor",
      id: investorId,
    }, { from: investor.vantage_account_id, to: login });
  }

  revalidatePath(`/app/admin/users/${investorId}`);
  revalidatePath("/app/admin/users");
  return { ok: true };
}

/** A5 — move a subscription's expiry. Recorded, because it is money. */
export async function setSubscriptionExpiry(
  subscriptionId: string,
  expiresAt: string,
): Promise<AdminActionResult> {
  const admin = await requirePermission("users.edit");
  if (!admin) return { ok: false, error: "forbidden" };

  const when = new Date(expiresAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "bad_date" };

  const service = createServiceClient();

  const { data: before } = await service
    .from("subscriptions")
    .select("investor_id, expires_at, status")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (!before) return { ok: false, error: "not_found" };
  // An unconfirmed invoice has no term to move, and giving it one would grant
  // access that was never paid for.
  if (before.status !== "confirmed") return { ok: false, error: "not_confirmed" };

  const { error } = await service
    .from("subscriptions")
    .update({ expires_at: when.toISOString() })
    .eq("id", subscriptionId);

  if (error) return { ok: false, error: "generic" };

  await recordAdminAction("subscription.expiry_changed", {
    type: "subscription",
    id: subscriptionId,
  }, { from: before.expires_at, to: when.toISOString() });

  revalidatePath(`/app/admin/users/${before.investor_id}`);
  return { ok: true };
}

/**
 * A6 — disable. Reversible, and the reason is required.
 *
 * Three things happen: sign-in is banned at the auth layer, the investor is
 * suspended so the bot detaches, and the subscription is paused rather than
 * consumed. The database function owns the last two.
 */
export async function disableUser(
  investorId: string,
  reason: string,
): Promise<AdminActionResult> {
  const admin = await requirePermission("users.disable");
  if (!admin) return { ok: false, error: "forbidden" };
  if (!reason.trim()) return { ok: false, error: "reason_required" };

  const service = createServiceClient();

  const { data: investor } = await service
    .from("investors")
    .select("user_id")
    .eq("id", investorId)
    .maybeSingle();
  if (!investor) return { ok: false, error: "not_found" };

  const { error } = await service.rpc("disable_investor", {
    p_investor_id: investorId,
    p_reason: reason.trim(),
  });

  if (error) {
    console.error("[admin/users] disable failed:", error.message);
    return { ok: false, error: "generic" };
  }

  // Suspending the investor stops the bot; this stops them signing in. Both
  // are needed — "disabled" that still lets someone log in and look around is
  // not what the word means.
  await service.auth.admin.updateUserById(investor.user_id, {
    ban_duration: "876000h", // ~100 years; Supabase has no "forever".
  });

  await recordAdminAction("user.disabled", { type: "investor", id: investorId }, {
    reason: reason.trim(),
  });

  revalidatePath(`/app/admin/users/${investorId}`);
  revalidatePath("/app/admin/users");
  return { ok: true };
}

/** A6 — re-enable, restoring the previous state. */
export async function enableUser(
  investorId: string,
): Promise<AdminActionResult> {
  const admin = await requirePermission("users.disable");
  if (!admin) return { ok: false, error: "forbidden" };

  const service = createServiceClient();

  const { data: investor } = await service
    .from("investors")
    .select("user_id")
    .eq("id", investorId)
    .maybeSingle();
  if (!investor) return { ok: false, error: "not_found" };

  const { error } = await service.rpc("enable_investor", {
    p_investor_id: investorId,
  });
  if (error) return { ok: false, error: "generic" };

  await service.auth.admin.updateUserById(investor.user_id, {
    ban_duration: "none",
  });

  await recordAdminAction("user.enabled", { type: "investor", id: investorId });

  revalidatePath(`/app/admin/users/${investorId}`);
  revalidatePath("/app/admin/users");
  return { ok: true };
}

/**
 * A7 — delete. Super admin only, and the email must be typed to confirm.
 *
 * A soft delete: personal data is anonymised and the money rows are kept. The
 * reasoning is in the migration — a receipt naming nobody is still a valid
 * record of a payment, while a payment that never happened is a hole in the
 * books.
 */
export async function deleteUser(
  investorId: string,
  typedEmail: string,
): Promise<AdminActionResult> {
  const admin = await requirePermission("users.delete");
  if (!admin) return { ok: false, error: "forbidden" };

  const service = createServiceClient();

  const { data: investor } = await service
    .from("investors")
    .select("user_id, deleted_at")
    .eq("id", investorId)
    .maybeSingle();
  if (!investor) return { ok: false, error: "not_found" };
  if (investor.deleted_at) return { ok: true };

  const { data: account } = await service.auth.admin.getUserById(
    investor.user_id,
  );
  const email = account?.user?.email ?? "";

  // Typed, not clicked. "Are you sure?" is answered yes by reflex; an address
  // has to be read off the screen first.
  if (typedEmail.trim().toLowerCase() !== email.toLowerCase()) {
    return { ok: false, error: "email_mismatch" };
  }

  const { error } = await service.rpc("soft_delete_investor", {
    p_investor_id: investorId,
  });
  if (error) {
    console.error("[admin/users] delete failed:", error.message);
    return { ok: false, error: "generic" };
  }

  // The auth account is anonymised rather than removed: deleting it would
  // cascade to investors and take the money rows with it.
  await service.auth.admin.updateUserById(investor.user_id, {
    email: `deleted+${investor.user_id}@highzcore.invalid`,
    ban_duration: "876000h",
  });

  // The audit entry keeps the address the account had, because afterwards
  // nothing else does.
  await recordAdminAction("user.deleted", { type: "investor", id: investorId }, {
    email,
  });

  revalidatePath("/app/admin/users");
  return { ok: true };
}
