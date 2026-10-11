import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Plans } from "@/components/sections/plans";
import { ButtonLink, Card, Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "$20 a month for Scora — all 30 markets, API keys included. 5% off longer terms.",
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
          {/* What they are buying, stated before what they are not. The old
              first card here disclosed Vantage's performance fee — correct
              when this page sold the bot, misleading now that it sells Scora,
              because that fee only exists for managed clients and they never
              buy through this page. It moved to the managed card below. */}
          <Card>
            <h2 className="text-lg font-semibold">{t("included.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("included.body")}
            </p>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">{t("noRefund.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("noRefund.body")}
            </p>
          </Card>
        </div>

        {/* The one thing this price does NOT buy, with the way to get it.
            Somebody on the pricing page who wanted managed trading should not
            have to go back to the homepage to find out it is sold elsewhere. */}
        <Card className="mt-6 max-w-4xl">
          <h2 className="text-lg font-semibold">{t("managed.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
            {t("managed.body")}
          </p>
          <ButtonLink href="/investors" variant="secondary" className="mt-5">
            {t("managed.cta")}
          </ButtonLink>
        </Card>
      </Container>
    </>
  );
}
