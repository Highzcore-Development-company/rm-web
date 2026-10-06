import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Receipt } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";

// @react-pdf/renderer needs Node APIs; it cannot run on the edge runtime.
export const runtime = "nodejs";

/**
 * P2-312 — one receipt per payment, downloadable and emailable.
 *
 * Reads as the signed-in user on purpose. RLS already restricts subscriptions
 * to the investor who owns them, so an id belonging to someone else simply
 * returns nothing — the authorisation is the database's, not a check in this
 * handler that could be forgotten.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Not 403: telling someone a receipt exists but is not theirs is itself a
  // disclosure. Either it is yours or it does not exist.
  if (!subscription || subscription.status !== "confirmed") {
    return new NextResponse("Not found", { status: 404 });
  }

  const pdf = await renderToBuffer(
    Receipt({ subscription, email: auth.user.email ?? "" }),
  );

  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="highzcore-receipt-${id.slice(0, 8)}.pdf"`,
      // A receipt is per-user; a shared cache must never serve one to anybody
      // else.
      "Cache-Control": "private, no-store",
    },
  });
}
