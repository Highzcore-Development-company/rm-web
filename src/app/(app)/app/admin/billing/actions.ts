"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/admin";
import { sendReceiptFor } from "@/lib/send-receipt";
import { verifyTransaction } from "@/lib/alatpay";
import {
  getIncomingTransfers,
  isAcceptedContract,
  isConfirmed,
  settlesInvoice,
} from "@/lib/tron-watch";

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
