"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/admin";
import { accountLinkedEmail, sendEmail } from "@/lib/email";
import { entitlementFrom } from "@/lib/entitlement";
import type { Subscription } from "@/lib/supabase/types";
import { envOr } from "@/lib/env";

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
    .update({ status: "linked", linked_at: new Date().toISOString() })
    .eq("id", investorId);

  if (error) {
    console.error("[admin/links] confirm failed:", error);
    return { ok: false, error: "generic" };
  }

  // The link-account page promises "we will confirm the link and email you".
  // A promise made in the UI has to be kept by the code, or someone submits a
  // claim and waits indefinitely with no idea anything happened.
  //
  // Deliberately after the status change and never allowed to undo it: a mail
  // server being down must not leave an investor unlinked.
  await notifyLinked(investorId, investor.vantage_account_id);

  revalidatePath("/app/admin/links");
  return { ok: true };
}

/** Best-effort. Failures are logged, never surfaced as a failed confirmation. */
async function notifyLinked(investorId: string, vantageAccountId: string) {
  try {
    const service = createServiceClient();

    const { data: investor } = await service
      .from("investors")
      .select("user_id")
      .eq("id", investorId)
      .maybeSingle();
    if (!investor) return;

    const { data: account } = await service.auth.admin.getUserById(
      investor.user_id,
    );
    const email = account?.user?.email;
    if (!email) return;

    // Whether they still owe us a subscription changes what the email asks
    // them to do, so it is read rather than assumed.
    const { data: subs } = await service
      .from("subscriptions")
      .select("*")
      .eq("investor_id", investorId);

    const entitlement = entitlementFrom((subs ?? []) as Subscription[]);
    const site = envOr(process.env.NEXT_PUBLIC_SITE_URL, "https://highzcore.com");

    const message = accountLinkedEmail({
      vantageAccountId,
      dashboardUrl: `${site}/app/dashboard`,
      subscribed: entitlement.active || entitlement.inGrace,
      subscribeUrl: `${site}/app/checkout`,
    });

    const sent = await sendEmail({ to: email, ...message });
    if (!sent.ok) {
      console.error("[admin/links] linked email not sent:", sent.error);
    }
  } catch (err) {
    console.error("[admin/links] linked email threw:", err);
  }
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
    .update({ vantage_account_id: null, linked_at: null, status: "pending" })
    .eq("id", investorId);

  if (error) {
    console.error("[admin/links] reject failed:", error);
    return { ok: false, error: "generic" };
  }

  revalidatePath("/app/admin/links");
  return { ok: true };
}
