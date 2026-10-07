"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";

export type SaveResult = { ok: true } | { ok: false; error: string };

const SWITCHES = [
  "trade_opened",
  "trade_closed",
  "subscription_expiring",
  "bot_switched_off",
] as const;

export type SwitchKey = (typeof SWITCHES)[number];

/**
 * P2-506 — save notification preferences.
 *
 * Runs as the investor, not the service role. They own this data and the RLS
 * policy already says so; there is nothing here to protect them from.
 */
export async function saveNotificationPreferences(
  formData: FormData,
): Promise<SaveResult> {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return { ok: false, error: "not_signed_in" };

  // An unchecked checkbox sends nothing at all, so absence means off. Reading
  // it the other way round would make every box impossible to turn off.
  const values = Object.fromEntries(
    SWITCHES.map((key) => [key, formData.get(key) === "on"]),
  );

  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ investor_id: investor.id, ...values }, { onConflict: "investor_id" });

  if (error) {
    console.error("[notifications] save failed:", error);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/account");
  return { ok: true };
}
