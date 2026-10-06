"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, verificationCodeEmail } from "@/lib/email";
import {
  canResend,
  CODE_TTL_MINUTES,
  codeMatches,
  expiryFromNow,
  generateCode,
  hashCode,
  MAX_ATTEMPTS,
} from "@/lib/verification";

export type VerifyResult = { ok: true } | { ok: false; error: string };

/**
 * Issue a code and email it.
 *
 * Runs for the SIGNED-IN user only. Taking an address as a parameter would
 * make this an open relay: anyone could have our domain mail anyone, which is
 * both abuse and a fast way to lose the sending reputation of a new domain.
 */
export async function sendVerificationCode(): Promise<VerifyResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) return { ok: false, error: "not_signed_in" };

  const service = createServiceClient();

  const { data: existing } = await service
    .from("email_verifications")
    .select("last_sent_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existing && !canResend(existing.last_sent_at)) {
    return { ok: false, error: "too_soon" };
  }

  const code = generateCode();

  // Replaces any previous code: two valid codes at once doubles the guessing
  // surface for no benefit, and the attempt counter resets with the new one.
  const { error } = await service.from("email_verifications").upsert(
    {
      user_id: auth.user.id,
      code_hash: hashCode(code),
      expires_at: expiryFromNow().toISOString(),
      attempts: 0,
      last_sent_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[verify] could not store code:", error);
    return { ok: false, error: "generic" };
  }

  const sent = await sendEmail({
    to: auth.user.email,
    ...verificationCodeEmail({ code, minutes: CODE_TTL_MINUTES }),
  });

  if (!sent.ok) {
    console.error("[verify] could not send code:", sent.error);
    return { ok: false, error: "send_failed" };
  }

  return { ok: true };
}

/** Check a code. Every failure path says the same thing to the user. */
export async function verifyCode(code: string): Promise<VerifyResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "not_signed_in" };

  const service = createServiceClient();

  const { data: pending } = await service
    .from("email_verifications")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!pending) return { ok: false, error: "invalid" };

  if (new Date(pending.expires_at) < new Date()) {
    return { ok: false, error: "expired" };
  }

  // Counted before the comparison, so a crash or a dropped connection cannot
  // be used to retry for free.
  if (pending.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "too_many" };
  }

  if (!codeMatches(code.trim(), pending.code_hash)) {
    await service
      .from("email_verifications")
      .update({ attempts: pending.attempts + 1 })
      .eq("user_id", auth.user.id);
    return { ok: false, error: "invalid" };
  }

  // Ours is the flag that gates access; Supabase auto-confirms, so its own
  // email_confirmed_at means nothing in this product.
  const { error: markError } = await service
    .from("investors")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("user_id", auth.user.id);

  if (markError) {
    console.error("[verify] could not mark verified:", markError);
    return { ok: false, error: "generic" };
  }

  // Consumed. A used code must not be replayable.
  await service.from("email_verifications").delete().eq("user_id", auth.user.id);

  return { ok: true };
}
