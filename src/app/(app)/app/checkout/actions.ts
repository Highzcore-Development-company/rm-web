"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getInvestor } from "@/lib/investors";
import { isPlanMonths, priceFor } from "@/lib/pricing";
import {
  QUOTED_USD_NGN_E6,
  usdCentsToMicroUsdt,
  usdCentsToNgnKobo,
} from "@/lib/money";
import { getWatchXpub, tronAddressFromXpub } from "@/lib/tron";
import { createVirtualAccount, isAlatPayConfigured } from "@/lib/alatpay";
import type { PaymentMethod } from "@/lib/supabase/types";

export type CheckoutResult =
  | {
      ok: true;
      kind: "bank_transfer";
      subscriptionId: string;
      accountNumber: string;
      bankName: string | null;
      amountNgn: number;
      reference: string;
    }
  | {
      ok: true;
      kind: "crypto";
      subscriptionId: string;
      address: string;
      microUsdt: number;
      confirmations: number;
      expiresAt: string;
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
  // Stored, not just returned. The payer will refresh, close the tab, or come
  // back from their banking app, and the account number has to survive all
  // three — otherwise they see the chooser again and may pay twice.
  await service
    .from("subscriptions")
    .update({
      provider_ref: result.data.reference,
      provider_account_number: result.data.accountNumber,
      provider_bank_name: result.data.bankName,
    })
    .eq("id", subscription.id);

  return {
    ok: true,
    kind: "bank_transfer",
    subscriptionId: subscription.id,
    accountNumber: result.data.accountNumber,
    bankName: result.data.bankName,
    amountNgn: amountNgnKobo,
    reference: result.data.reference,
  };
}

/**
 * P2-306 — raise a USDT invoice: one freshly derived address, used once.
 *
 * The derivation index comes from a database sequence, not a count of existing
 * rows. Counting races: two checkouts a millisecond apart would both read N
 * and both derive the same address, which is the exact collision the unique
 * constraint exists to catch — and catching it there means someone's checkout
 * fails rather than their payment going astray, but better not to race at all.
 */
export async function startCryptoInvoice(
  months: number,
): Promise<CheckoutResult> {
  if (!isPlanMonths(months)) return { ok: false, error: "bad_term" };

  const xpub = getWatchXpub();
  const contract = process.env.USDT_TRC20_CONTRACT;
  if (!xpub || !contract) return { ok: false, error: "not_configured" };

  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return { ok: false, error: "not_signed_in" };

  const price = priceFor(months);
  const micro = usdCentsToMicroUsdt(price.totalCents);
  const confirmations = Number(process.env.DEPOSIT_CONFIRMATIONS ?? 20);

  const service = createServiceClient();

  const { data: subscription, error: insertError } = await service
    .from("subscriptions")
    .insert({
      investor_id: investor.id,
      months,
      amount_usd: price.totalCents,
      method: "usdt_trc20",
    })
    .select()
    .maybeSingle();

  if (insertError || !subscription) {
    console.error("[checkout] crypto invoice insert failed:", insertError);
    return { ok: false, error: "generic" };
  }

  // Claim an index first; the address is derived from whatever we are given.
  const { data: seq, error: seqError } = await service.rpc(
    "next_crypto_derivation_index",
  );
  if (seqError || typeof seq !== "number") {
    console.error("[checkout] could not claim a derivation index:", seqError);
    return { ok: false, error: "generic" };
  }

  const address = tronAddressFromXpub(xpub, seq);

  const { data: invoice, error: invoiceError } = await service
    .from("crypto_invoices")
    .insert({
      subscription_id: subscription.id,
      derivation_index: seq,
      address,
      expected_micro_usdt: micro,
      // Recorded per invoice, not read from config when crediting. Config
      // changes; what this invoice promised the payer must not.
      contract,
      confirmations_required: confirmations,
    })
    .select()
    .maybeSingle();

  if (invoiceError || !invoice) {
    console.error("[checkout] crypto invoice failed:", invoiceError);
    return { ok: false, error: "generic" };
  }

  return {
    ok: true,
    kind: "crypto",
    subscriptionId: subscription.id,
    address,
    microUsdt: micro,
    confirmations,
    expiresAt: invoice.expires_at,
  };
}

/**
 * Abandon the open invoice and go back to choosing.
 *
 * Restoring an outstanding payment on refresh stopped people paying twice, but
 * it also pinned them to whatever they picked first: an invoice they changed
 * their mind about blocked every other method until it expired.
 *
 * REFUSED once anything has been seen on chain. Marking it expired stops the
 * watcher looking at that address, so doing it after a transfer has landed
 * would orphan real money.
 */
export async function abandonOutstanding(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);
  if (!investor) return { ok: false, error: "not_signed_in" };

  const service = createServiceClient();

  const { data: subscription } = await service
    .from("subscriptions")
    .select("id, method")
    .eq("investor_id", investor.id)
    .eq("status", "awaiting")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) return { ok: true };

  if (subscription.method === "usdt_trc20") {
    const { data: invoice } = await service
      .from("crypto_invoices")
      .select("id, seen_tx_hash")
      .eq("subscription_id", subscription.id)
      .maybeSingle();

    if (invoice?.seen_tx_hash) return { ok: false, error: "already_sent" };

    if (invoice) {
      await service
        .from("crypto_invoices")
        .update({ status: "expired" })
        .eq("id", invoice.id);
    }
  }

  await service
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("id", subscription.id);

  return { ok: true };
}
