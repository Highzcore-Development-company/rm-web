"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getInvestor } from "@/lib/investors";
import { sendReceiptFor } from "@/lib/send-receipt";
import {
  getIncomingTransfers,
  isAcceptedContract,
  isConfirmed,
  settlesInvoice,
} from "@/lib/tron-watch";

export type PaymentStatus =
  | { state: "awaiting" }
  | { state: "seen"; confirmations: number; required: number }
  | { state: "confirmed" }
  | { state: "expired" }
  | { state: "unknown" };

/**
 * Where a payment has got to, for the page the payer is looking at.
 *
 * It also CHECKS THE CHAIN rather than only reading our table. The scheduled
 * watcher is what guarantees an invoice is eventually credited, but it runs on
 * a timer — so without this, someone who has just sent USDT watches a page
 * that cannot change for minutes, and reasonably concludes it did not work.
 *
 * Scoped to one invoice belonging to the caller, so polling it is cheap and
 * cannot be used to sweep the whole book.
 */
export async function getPaymentStatus(
  subscriptionId: string,
): Promise<PaymentStatus> {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return { state: "unknown" };

  // RLS already restricts this to their own rows; the investor_id check makes
  // that explicit rather than relying on it from a distance.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, status, investor_id, method")
    .eq("id", subscriptionId)
    .eq("investor_id", investor.id)
    .maybeSingle();

  if (!subscription) return { state: "unknown" };
  if (subscription.status === "confirmed") return { state: "confirmed" };
  if (subscription.status === "expired") return { state: "expired" };

  // Bank transfer is confirmed by ALATPay's webhook, not by us looking.
  if (subscription.method !== "usdt_trc20") return { state: "awaiting" };

  const { data: invoice } = await supabase
    .from("crypto_invoices")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .maybeSingle();

  if (!invoice) return { state: "awaiting" };
  if (invoice.status === "confirmed") return { state: "confirmed" };
  if (invoice.status === "expired") return { state: "expired" };

  const transfers = await getIncomingTransfers(invoice.address);
  if (!transfers) {
    // Could not reach TRON. Report what we last knew rather than inventing a
    // state — "nothing has arrived" would be a claim we cannot support.
    return invoice.seen_tx_hash
      ? {
          state: "seen",
          confirmations: 0,
          required: invoice.confirmations_required,
        }
      : { state: "awaiting" };
  }

  const service = createServiceClient();

  for (const transfer of transfers) {
    // The same two gates the watcher applies. Duplicated deliberately rather
    // than relaxed for the "just checking" path — a looser check here would be
    // the one an attacker uses.
    if (!isAcceptedContract(transfer, invoice.contract)) continue;
    if (!settlesInvoice(transfer, invoice.expected_micro_usdt)) continue;

    if (!isConfirmed(transfer, invoice.confirmations_required)) {
      await service
        .from("crypto_invoices")
        .update({
          status: "seen",
          seen_tx_hash: transfer.txHash,
          seen_micro_usdt: transfer.microUsdt,
          seen_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      return {
        state: "seen",
        confirmations: transfer.confirmations,
        required: invoice.confirmations_required,
      };
    }

    const { error } = await service.rpc("activate_subscription", {
      p_subscription_id: subscriptionId,
      p_provider_ref: transfer.txHash,
    });

    if (error) {
      // Usually a unique violation because the watcher got there first, which
      // means it is already paid — not a failure.
      console.error("[status] activation:", error.message);
    }

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
    return { state: "confirmed" };
  }

  return { state: "awaiting" };
}
