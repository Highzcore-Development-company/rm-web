import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import { EnquiryForm } from "@/components/enquiry-form";

export const metadata: Metadata = {
  title: "Managed trading",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * HS-BOT-v4 §1 — where an investor lands, instead of checkout.
 *
 * THE POINT OF THIS PAGE IS THAT IT DOES NOT COMPLETE ANYTHING. An investor
 * cannot finish signing up on their own and should not be able to: they tell
 * us how to reach them, Victor meets them, and the account is set up with
 * them. There is deliberately no payment, no broker field and no "continue"
 * that leads anywhere — a self-serve investor flow is the wrong product.
 *
 * A trader never sees it. They have already gone to checkout.
 */
export default async function EnquiryPage() {
  const t = await getTranslations("enquiry");
  const supabase = await createClient();
  const investor = await getInvestor(supabase);

  // A trader has nothing to enquire about — they buy Scora and start using
  // it. Sent to the desk rather than shown a form that would confuse them.
  if (investor?.account_type === "trader") redirect("/app/dashboard");

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-xl">
        <h1 className="display text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">
          {t("intro")}
        </p>

        {/* Said before the form, not after it. Somebody filling this in is
            deciding whether to trust us with a brokerage account, and the
            custody answer is the thing that decides it. */}
        <ul className="mt-6 space-y-2 text-sm leading-relaxed text-fg-muted">
          <li>{t("points.custody")}</li>
          <li>{t("points.permission")}</li>
          <li>{t("points.call")}</li>
        </ul>

        <div className="mt-8">
          <EnquiryForm />
        </div>
      </div>
    </Container>
  );
}
