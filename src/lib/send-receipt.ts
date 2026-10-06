import { renderToBuffer } from "@react-pdf/renderer";
import { Receipt } from "@/lib/receipt";
import { createServiceClient } from "@/lib/supabase/service";
import { receiptEmail, sendEmail } from "@/lib/email";
import { formatUsd } from "@/lib/pricing";
import type { Subscription } from "@/lib/supabase/types";

/**
 * P2-312 — email the receipt once a payment is banked.
 *
 * Called from the payment paths, never from a page. Best-effort throughout:
 * a receipt that failed to send must never undo a payment that succeeded.
 * The PDF is always downloadable from the dashboard regardless, so the worst
 * case is an email someone has to go and fetch themselves.
 */
export async function sendReceiptFor(subscriptionId: string): Promise<void> {
  try {
    const service = createServiceClient();

    const { data: subscription } = await service
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (!subscription || subscription.status !== "confirmed") return;

    const { data: investor } = await service
      .from("investors")
      .select("user_id")
      .eq("id", subscription.investor_id)
      .maybeSingle();
    if (!investor) return;

    const { data: account } = await service.auth.admin.getUserById(
      investor.user_id,
    );
    const email = account?.user?.email;
    if (!email) return;

    // The same component the download route renders, so the attachment and
    // the downloadable copy can never disagree.
    const pdf = await renderToBuffer(
      Receipt({ subscription: subscription as Subscription, email }),
    );

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://highzcore.com";
    const expires = subscription.expires_at
      ? new Date(subscription.expires_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";

    const message = receiptEmail({
      months: subscription.months,
      amount: formatUsd(subscription.amount_usd),
      expiresAt: expires,
      dashboardUrl: `${site}/app/dashboard`,
    });

    const sent = await sendEmail({
      to: email,
      ...message,
      attachments: [
        {
          filename: `highzcore-receipt-${subscriptionId.slice(0, 8)}.pdf`,
          content: Buffer.from(pdf),
          contentType: "application/pdf",
        },
      ],
    });

    if (!sent.ok) console.error("[receipt] not sent:", sent.error);
  } catch (err) {
    console.error("[receipt] threw:", err);
  }
}
