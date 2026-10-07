"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdmin, recordAdminAction, requirePermission } from "@/lib/admin";
import { sendReceiptFor } from "@/lib/send-receipt";
import { verifyTransaction } from "@/lib/alatpay";
import {
  getIncomingTransfers,
  isAcceptedContract,
  isConfirmed,
  settlesInvoice,
} from "@/lib/tron-watch";

/**
 * P2-311 — record that an investor has been detached from the MAM.
 *
 * Sets our status only. It does NOT detach anything at Vantage — nothing here
 * can, and the UI says so. If this silently implied the Vantage side were done,
 * an admin would tick it and walk away while the bot kept copying an account
 * nobody is paying for.
 *
 * Reached from three places now — lapsed, disabled and deleted — because the
 * bot trades one master account and has no per-user loop. Detachment at the
 * broker is the only thing that stops an investor being copied, whatever the
 * reason, and it is a human step either way.
 */
export async function markDetached(
  investorId: string,
): Promise<{ ok: boolean }> {
  // A2: this stops an account being traded, so it needs the same permission
  // as disabling one — not merely "is an admin".
  const admin = await requirePermission("users.disable");
  if (!admin) return { ok: false };

  const { error } = await createServiceClient()
    .from("investors")
    .update({ status: "suspended" })
    .eq("id", investorId);

  if (error) {
    console.error("[admin/billing] mark detached failed:", error);
    return { ok: false };
  }

  await recordAdminAction("investor.detached", {
    type: "investor",
    id: investorId,
  });

  revalidatePath("/app/admin/billing");
  return { ok: true };
}

/**
 * Record a refund that was paid out by hand.
 *
 * Victor's ruling: refunds stay a manual bank transfer for now, but they are
 * recorded so the financial overview does not drift from reality. So this
 * writes a note and NOTHING ELSE — it moves no money, calls no provider, and
 * deliberately does not shorten the entitlement. If access should also end,
 * an admin changes the expiry, visibly and on purpose.
 *
 * The amount is capped by the database at what was actually charged: a refund
 * bigger than the payment is a typo, not a refund.
 */
export async function recordRefund(
  subscriptionId: string,
  amountUsd: number,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requirePermission("finance.view");
  if (!admin) return { ok: false, error: "forbidden" };

  if (!Number.isInteger(amountUsd) || amountUsd <= 0) {
    return { ok: false, error: "bad_amount" };
  }
  // A refund with no stated reason is unauditable six months later, which is
  // exactly when somebody will ask about it.
  if (reason.trim().length < 3) return { ok: false, error: "no_reason" };

  const { error } = await createServiceClient()
    .from("subscriptions")
    .update({
      refunded_usd: amountUsd,
      refunded_at: new Date().toISOString(),
      refunded_reason: reason.trim(),
      refunded_by: admin.email,
    })
    .eq("id", subscriptionId)
    .eq("status", "confirmed");

  if (error) {
    console.error("[admin/billing] record refund failed:", error.message);
    // The amount cap is a CHECK constraint, so "too big" arrives here as a
    // database error rather than passing validation above.
    return { ok: false, error: "too_large" };
  }

  await recordAdminAction("subscription.refund_recorded", {
    type: "subscription",
    id: subscriptionId,
  }, { amount_usd: amountUsd, reason: reason.trim() });

  revalidatePath("/app/admin/billing");
  return { ok: true };
}

/**
 * Check one outstanding invoice against the provider, on demand.
 *
 * Payments confirm themselves — ALATPay posts a webhook, the watcher polls the
 * chain. This is for the case where someone says they have paid and the system
 * disagrees: it answers "has the money actually arrived" without anyone
 * guessing, and without a human being able to mark something paid that is not.
 *
 * There is deliberately no "mark as paid" button. A payment is confirmed by
 * the money existing, not by an admin believing it does.
 */
export async function recheckPayment(
  subscriptionId: string,
): Promise<{ ok: boolean; paid: boolean }> {
  if (!(await isAdmin())) return { ok: false, paid: false };

  const service = createServiceClient();

  const { data: subscription } = await service
    .from("subscriptions")
    .select("id, status, method, provider_ref")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (!subscription) return { ok: false, paid: false };
  if (subscription.status === "confirmed") return { ok: true, paid: true };

  if (subscription.method === "usdt_trc20") {
    const { data: invoice } = await service
      .from("crypto_invoices")
      .select("*")
      .eq("subscription_id", subscriptionId)
      .maybeSingle();
    if (!invoice) return { ok: true, paid: false };

    const transfers = await getIncomingTransfers(invoice.address);
    if (!transfers) return { ok: false, paid: false };

    for (const transfer of transfers) {
      if (!isAcceptedContract(transfer, invoice.contract)) continue;
      if (!settlesInvoice(transfer, invoice.expected_micro_usdt)) continue;
      if (!isConfirmed(transfer, invoice.confirmations_required)) continue;

      const { error } = await service.rpc("activate_subscription", {
        p_subscription_id: subscriptionId,
        p_provider_ref: transfer.txHash,
      });
      if (error) console.error("[admin/billing] recheck activate:", error.message);

      await service
        .from("crypto_invoices")
        .update({
          status: "confirmed",
          seen_tx_hash: transfer.txHash,
          seen_micro_usdt: transfer.microUsdt,
          seen_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      await sendReceiptFor(subscriptionId);
      revalidatePath("/app/admin/billing");
      return { ok: true, paid: true };
    }

    return { ok: true, paid: false };
  }

  // Bank transfer and card: ask ALATPay directly rather than wait for a
  // webhook that may have been lost.
  if (!subscription.provider_ref) return { ok: true, paid: false };

  const verified = await verifyTransaction(subscription.provider_ref);
  if (!verified.ok) return { ok: false, paid: false };
  if (verified.data.status !== "succeeded") return { ok: true, paid: false };

  const { error } = await service.rpc("activate_subscription", {
    p_subscription_id: subscriptionId,
    p_provider_ref: subscription.provider_ref,
  });
  if (error) console.error("[admin/billing] recheck activate:", error.message);

  await sendReceiptFor(subscriptionId);
  revalidatePath("/app/admin/billing");
  return { ok: true, paid: true };
}
