"use server";

import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";

export type AckResult = { ok: true } | { ok: false; error: string };

/**
 * P2-104 — record the acknowledgement.
 *
 * Runs as the investor, not the service role: the RLS policy already says they
 * may set this on their own row and only while it is null. The database, not
 * this function, is what stops it being rewritten later.
 */
export async function acknowledgeRisk(): Promise<AckResult> {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return { ok: false, error: "not_signed_in" };

  if (investor.risk_acknowledged_at) return { ok: true };

  const { error } = await supabase
    .from("investors")
    .update({ risk_acknowledged_at: new Date().toISOString() })
    .eq("user_id", investor.user_id);

  if (error) {
    console.error("[risk] could not record acknowledgement:", error);
    return { ok: false, error: "generic" };
  }

  return { ok: true };
}
