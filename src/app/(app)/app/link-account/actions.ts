"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isValidMt5Login } from "@/lib/vantage";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * P2-203 — the investor claims their Vantage account.
 *
 * Runs as the signed-in user, not the service role: the RLS policy already
 * says they may write vantage_account_id on their own row and only while
 * linked_at is null. Using the service role here would throw that away and
 * make this code the only thing standing between one investor and another's
 * row.
 */
export async function claimAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = String(formData.get("vantage_account_id") ?? "").trim();

  if (!isValidMt5Login(raw)) {
    return { ok: false, error: "invalid_login" };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("investors")
    .update({ vantage_account_id: raw })
    .eq("user_id", auth.user.id);

  if (error) {
    // 23505: someone already claimed this login. Say so plainly — it is
    // usually a typo, and occasionally it is somebody trying to attach
    // themselves to an account that is not theirs.
    if (error.code === "23505") return { ok: false, error: "already_claimed" };
    console.error("[link-account] claim failed:", error);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/link-account");
  revalidatePath("/app/onboarding");
  return { ok: true };
}

/**
 * P2-205 — the investor asks to be disconnected.
 *
 * Service role, because status is not a column an investor may write. The
 * ownership check is therefore this function's job and is done explicitly.
 *
 * Setting 'suspended' here stops US treating them as tradeable. It does NOT
 * detach them at Vantage — only they can do that, through Vantage, and the UI
 * says so. Pretending otherwise would leave someone believing the bot has
 * stopped when it has not.
 */
export async function requestDisconnect(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "not_signed_in" };

  const service = createServiceClient();

  // Scoped by user_id, not by a client-supplied investor id. There is no
  // parameter here an attacker could point at somebody else's row.
  const { error } = await service
    .from("investors")
    // @ts-expect-error status is intentionally absent from the Update type —
    // investors may not write it. The service role may, and this is the one
    // place that is true.
    .update({ status: "suspended" })
    .eq("user_id", auth.user.id);

  if (error) {
    console.error("[link-account] disconnect failed:", error);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/link-account");
  revalidatePath("/app/onboarding");
  return { ok: true };
}
