"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/admin";

/**
 * P2-311 — record that a lapsed investor has been detached from the MAM.
 *
 * Sets our status only. It does NOT detach anything at Vantage — nothing here
 * can, and the UI says so. If this silently implied the Vantage side were done,
 * an admin would tick it and walk away while the bot kept trading an account
 * nobody is paying for.
 */
export async function markDetached(
  investorId: string,
): Promise<{ ok: boolean }> {
  if (!(await isAdmin())) return { ok: false };

  const { error } = await createServiceClient()
    .from("investors")
    .update({ status: "suspended" })
    .eq("id", investorId);

  if (error) {
    console.error("[admin/billing] mark detached failed:", error);
    return { ok: false };
  }

  revalidatePath("/app/admin/billing");
  return { ok: true };
}
