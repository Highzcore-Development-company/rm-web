import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";

export const metadata: Metadata = {
  title: "Subscribe",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** P2-303 — checkout. */
export default async function CheckoutPage() {
  const t = await getTranslations("checkout");
  const supabase = await createClient();
  const investor = await getInvestor(supabase);

  return (
    <Container className="py-12 sm:py-16">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Highzcore
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>

      <div className="mt-12 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {t("intro")}
        </p>

        {/* Said before they pay, not after. Paying does not start trading on
            its own, and someone who thinks it does will be waiting. */}
        {investor && !investor.vantage_account_id ? (
          <p className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
            {t("notLinked")}
          </p>
        ) : null}
      </div>

      <div className="mt-10">
        <CheckoutForm />
      </div>
    </Container>
  );
}
