"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/admin";

export type AdminResult = { ok: true } | { ok: false; error: string };

/**
 * P2-204 — an admin confirms a claimed link against the Vantage MAM panel.
 *
 * Manual on purpose. Vantage exposes no API we can check this against, and the
 * claim is self-reported: an investor types a login number and we have no way
 * to know it is theirs. A human comparing it to the MAM panel is the control.
 * Automate this only when Vantage gives us something to automate against.
 */
export async function confirmLink(investorId: string): Promise<AdminResult> {
  if (!(await isAdmin())) return { ok: false, error: "forbidden" };

  const service = createServiceClient();

  const { data: investor, error: readError } = await service
    .from("investors")
    .select("vantage_account_id")
    .eq("id", investorId)
    .maybeSingle();

  if (readError || !investor) return { ok: false, error: "not_found" };

  // The check constraint would catch this, but the error it produces is not
  // one an admin screen can explain. Refuse it here with a reason.
  if (!investor.vantage_account_id) {
    return { ok: false, error: "no_account_claimed" };
  }

  const { error } = await service
    .from("investors")
    // @ts-expect-error status and linked_at are deliberately absent from the
    // Update type: no investor may write them. Admin action, service role.
    .update({ status: "linked", linked_at: new Date().toISOString() })
    .eq("id", investorId);

  if (error) {
    console.error("[admin/links] confirm failed:", error);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/admin/links");
  return { ok: true };
}

/**
 * Rejects a claim: clears the login so the investor can enter a different one.
 *
 * Does not suspend them. A mistyped account number is not misconduct, and
 * suspension is a status that should mean something.
 */
export async function rejectLink(investorId: string): Promise<AdminResult> {
  if (!(await isAdmin())) return { ok: false, error: "forbidden" };

  const service = createServiceClient();
  const { error } = await service
    .from("investors")
    // @ts-expect-error see above — service-role write of protected columns.
    .update({ vantage_account_id: null, linked_at: null, status: "pending" })
    .eq("id", investorId);

  if (error) {
    console.error("[admin/links] reject failed:", error);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/admin/links");
  return { ok: true };
}
