import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyTransaction } from "@/lib/alatpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P2-308 — bank a payment.
 *
 * ALATPay tells us a reference changed. We do NOT take its word for the
 * amount or the status: the body of an inbound webhook is attacker-controlled
 * until proven otherwise, and this endpoint decides whether somebody's
 * subscription starts. So we take only the reference from the request and ask
 * ALATPay server-to-server what actually happened.
 *
 * Idempotent twice over: activate_subscription() returns the existing expiry
 * if the row is already confirmed, and the unique index on
 * (method, provider_ref) means one reference can be banked exactly once. A
 * retried or replayed delivery therefore cannot buy anyone a second month.
 */
export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const data = (payload.data ?? payload) as Record<string, unknown>;
  const reference = [
    data.transactionId,
    data.orderId,
    data.reference,
    data.id,
  ].find((value) => typeof value === "string" && value.length > 0) as
    | string
    | undefined;

  if (!reference) {
    console.error("[alatpay webhook] no reference in payload:", payload);
    return NextResponse.json({ error: "no_reference" }, { status: 400 });
  }

  const verified = await verifyTransaction(reference);
  if (!verified.ok) {
    // 503, not 400: this is our failure to reach ALATPay, and a 4xx would
    // tell them to stop retrying a delivery we still want.
    console.error("[alatpay webhook] verify failed:", verified.error);
    return NextResponse.json({ error: "verify_failed" }, { status: 503 });
  }

  if (verified.data.status !== "succeeded") {
    // Acknowledged so it stops being retried, but nothing is granted.
    return NextResponse.json({ status: verified.data.status });
  }

  const service = createServiceClient();

  const { data: subscription } = await service
    .from("subscriptions")
    .select("id, status")
    .eq("provider_ref", reference)
    .maybeSingle();

  if (!subscription) {
    console.error("[alatpay webhook] no invoice for reference:", reference);
    return NextResponse.json({ error: "unknown_reference" }, { status: 404 });
  }

  const { data: expiresAt, error } = await service.rpc(
    "activate_subscription",
    { p_subscription_id: subscription.id, p_provider_ref: reference },
  );

  if (error) {
    console.error("[alatpay webhook] activation failed:", error);
    return NextResponse.json({ error: "activation_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "confirmed", expires_at: expiresAt });
}
