import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorisedJob } from "@/lib/job-auth";
import { sendReceiptFor } from "@/lib/send-receipt";
import {
  getIncomingTransfers,
  isAcceptedContract,
  isConfirmed,
  settlesInvoice,
} from "@/lib/tron-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P2-307 — the confirmation watcher.
 *
 * Polls every outstanding invoice's address and credits the ones that have
 * been paid. Designed to be run on a schedule and to be safe when it is run
 * twice at once, because eventually it will be.
 *
 * Idempotency is layered, not hoped for:
 *   - the unique index on crypto_invoices.seen_tx_hash means one transaction
 *     can satisfy one invoice and no more;
 *   - activate_subscription() returns the existing expiry rather than
 *     extending anything when the row is already confirmed;
 *   - the unique index on (method, provider_ref) refuses the same tx hash
 *     being banked against a second subscription.
 *
 * Any one of those would do. All three are cheap, and this is money.
 */
export async function POST(request: Request) {
  if (!isAuthorisedJob(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const service = createServiceClient();

  const { data: invoices, error } = await service
    .from("crypto_invoices")
    .select("*")
    .in("status", ["awaiting", "seen"])
    .limit(100);

  if (error) {
    console.error("[crypto-watch] could not read invoices:", error);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  let checked = 0;
  let credited = 0;
  let ignored = 0;

  for (const invoice of invoices ?? []) {
    checked += 1;

    const transfers = await getIncomingTransfers(invoice.address);
    if (!transfers) continue;

    for (const transfer of transfers) {
      // Gate 1: anyone can mint a token called USDT and send a million of it
      // for free. Credit by symbol and a subscription costs nothing.
      if (!isAcceptedContract(transfer, invoice.contract)) {
        // Recorded against the invoice, not just counted. Somebody sent a
        // token to our address and is waiting; a tally on a job response does
        // not help them or us.
        await service
          .from("crypto_invoices")
          .update({
            problem: "wrong_contract",
            problem_detail: `Received ${transfer.microUsdt} of ${transfer.contract}, which is not the accepted token.`,
            problem_at: new Date().toISOString(),
          })
          .eq("id", invoice.id);
        ignored += 1;
        continue;
      }

      // Gate 2: an unconfirmed transfer has moved no money and a reorg can
      // erase it. Record the sighting so the UI can say "pending", but credit
      // nothing.
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
        continue;
      }

      // Underpayment is not accepted: tolerating "close enough" makes every
      // amount below the price a negotiation.
      if (!settlesInvoice(transfer, invoice.expected_micro_usdt)) {
        // Real money arrived and bought nothing. This was a console warning,
        // which is to say it was invisible to the only two people who need to
        // know: the payer, and whoever has to refund or top them up.
        await service
          .from("crypto_invoices")
          .update({
            problem: "underpaid",
            problem_detail: `Received ${(transfer.microUsdt / 1e6).toFixed(2)} USDT, expected ${(invoice.expected_micro_usdt / 1e6).toFixed(2)}.`,
            problem_at: new Date().toISOString(),
            seen_tx_hash: transfer.txHash,
            seen_micro_usdt: transfer.microUsdt,
            seen_at: new Date().toISOString(),
          })
          .eq("id", invoice.id);
        continue;
      }

      const { error: activateError } = await service.rpc(
        "activate_subscription",
        {
          p_subscription_id: invoice.subscription_id,
          p_provider_ref: transfer.txHash,
        },
      );

      if (activateError) {
        // A unique violation here means it was already banked — the correct
        // outcome for a repeated run, not a failure.
        console.error("[crypto-watch] activation failed:", activateError);
        continue;
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

      await sendReceiptFor(invoice.subscription_id);

      credited += 1;
      break;
    }
  }

  // Expire stale invoices so nothing is quoted forever. The address is never
  // reused, so expiry is safe; a late confirmation is still creditable by
  // hand.
  await service
    .from("crypto_invoices")
    .update({ status: "expired" })
    .lt("expires_at", new Date().toISOString())
    .in("status", ["awaiting", "seen"]);

  return NextResponse.json({ checked, credited, ignored });
}
