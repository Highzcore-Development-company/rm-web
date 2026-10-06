"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getInvestor } from "@/lib/investors";
import { isPlanMonths, priceFor } from "@/lib/pricing";
import { QUOTED_USD_NGN_E6, usdCentsToNgnKobo } from "@/lib/money";
import { createVirtualAccount, isAlatPayConfigured } from "@/lib/alatpay";
import type { PaymentMethod } from "@/lib/supabase/types";

export type CheckoutResult =
  | {
      ok: true;
      kind: "bank_transfer";
      accountNumber: string;
      bankName: string | null;
      amountNgn: number;
      reference: string;
    }
  | { ok: false; error: string };

/**
 * P2-304 — raise an invoice and get an account number to transfer to.
 *
 * THE PRICE IS CALCULATED HERE, from the months alone. The client sends how
 * long it wants, never how much it costs. If it could send an amount it could
 * send twelve months for one naira, and the subscriptions table has no insert
 * policy for authenticated users precisely so this is the only path in.
 */
export async function startBankTransfer(
  months: number,
  method: PaymentMethod,
): Promise<CheckoutResult> {
  if (!isPlanMonths(months)) return { ok: false, error: "bad_term" };
  if (method !== "alatpay_transfer" && method !== "alatpay_card") {
    return { ok: false, error: "bad_method" };
  }
  if (!isAlatPayConfigured()) return { ok: false, error: "not_configured" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const investor = await getInvestor(supabase);
  if (!auth.user || !investor) return { ok: false, error: "not_signed_in" };

  const price = priceFor(months);
  const amountNgnKobo = usdCentsToNgnKobo(price.totalCents, QUOTED_USD_NGN_E6);

  const service = createServiceClient();

  // The row exists BEFORE the provider is called, and it grants nothing while
  // status is 'awaiting'. If the call below fails we are left with an unpaid
  // invoice, which is harmless; the other order risks a payment we have no
  // record of.
  const { data: subscription, error: insertError } = await service
    .from("subscriptions")
    .insert({
      investor_id: investor.id,
      months,
      amount_usd: price.totalCents,
      amount_ngn: amountNgnKobo,
      fx_usd_ngn_e6: QUOTED_USD_NGN_E6,
      method,
    })
    .select()
    .maybeSingle();

  if (insertError || !subscription) {
    console.error("[checkout] invoice insert failed:", insertError);
    return { ok: false, error: "generic" };
  }

  const result = await createVirtualAccount({
    // ALATPay's amount is whole naira; ours is kobo. Converted here, at the
    // boundary, and nowhere else.
    amountNgn: Math.ceil(amountNgnKobo / 100),
    orderId: subscription.id,
    description: `Highzcore subscription — ${months} month${months === 1 ? "" : "s"}`,
    email: auth.user.email ?? "",
  });

  if (!result.ok) {
    // Logged with the raw body because the response shape is inferred rather
    // than documented — this log is how we learn the real field names.
    console.error("[checkout] ALATPay failed:", result.error, result.raw);
    await service
      .from("subscriptions")
      .update({ status: "failed" })
      .eq("id", subscription.id);
    return { ok: false, error: result.error };
  }

  // The provider reference is stored now so a webhook arriving in seconds can
  // find this row. It does NOT confirm anything — activation is a separate,
  // idempotent step that only runs once money is verified.
  await service
    .from("subscriptions")
    .update({ provider_ref: result.data.reference })
    .eq("id", subscription.id);

  return {
    ok: true,
    kind: "bank_transfer",
    accountNumber: result.data.accountNumber,
    bankName: result.data.bankName,
    amountNgn: amountNgnKobo,
    reference: result.data.reference,
  };
}
