import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import type { CheckoutResult } from "./actions";

/**
 * The invoice this investor already has open, if any.
 *
 * Checkout used to hold the raised invoice in client state alone, so a refresh
 * put the plan chooser back and made it look as though nothing had been
 * started. Someone who had already transferred would then raise a second
 * invoice and pay twice.
 *
 * Read on the server on every load, so the page is correct on first paint
 * rather than after a flash of the wrong thing.
 */
export async function getOutstandingPayment(): Promise<CheckoutResult | null> {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return null;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("investor_id", investor.id)
    .eq("status", "awaiting")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) return null;

  if (subscription.method === "usdt_trc20") {
    const { data: invoice } = await supabase
      .from("crypto_invoices")
      .select("*")
      .eq("subscription_id", subscription.id)
      .maybeSingle();

    // An expired address must not be shown as payable — it is no longer
    // watched, and money sent to it needs a human.
    if (!invoice || invoice.status === "expired") return null;

    return {
      ok: true,
      kind: "crypto",
      subscriptionId: subscription.id,
      address: invoice.address,
      microUsdt: invoice.expected_micro_usdt,
      confirmations: invoice.confirmations_required,
      expiresAt: invoice.expires_at,
    };
  }

  // Raised but never reached the provider, so there is nothing to pay to.
  if (!subscription.provider_account_number) return null;

  return {
    ok: true,
    kind: "bank_transfer",
    subscriptionId: subscription.id,
    accountNumber: subscription.provider_account_number,
    bankName: subscription.provider_bank_name,
    accountName: subscription.provider_account_name,
    amountNgn: subscription.amount_ngn ?? 0,
    reference: subscription.provider_ref ?? "",
  };
}
