import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Plans } from "@/components/sections/plans";
import { Card, Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "$20 per month for the software. 5% off any term longer than one month.",
};

/**
 * P2-103.
 *
 * The four terms are rendered by the same <Plans> component the landing page
 * uses. They were a bare table here while the rest of the site had been
 * redesigned, so the page read as unfinished — and worse, two renderings of
 * the same four prices are two places for them to drift apart.
 *
 * What this page adds beyond the landing section is the detail somebody who
 * has clicked through to "Pricing" is actually looking for: what else they
 * will be charged, and what the subscription does not do on its own.
 */
export default function PricingPage() {
  const t = useTranslations("pricing");

  return (
    <>
      <Plans />

      <Container className="pb-20 sm:pb-28">
        <div className="grid max-w-4xl gap-6 md:grid-cols-2">
          {/* The performance fee is disclosed on the pricing page, not buried.
              It is charged by Vantage, but it is still money the investor
              pays, and finding it later feels like finding it hidden. */}
          <Card>
            <h2 className="text-lg font-semibold">{t("performanceFee.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("performanceFee.body")}
            </p>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">{t("noRefund.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("noRefund.body")}
            </p>
          </Card>
        </div>
      </Container>
    </>
  );
}
