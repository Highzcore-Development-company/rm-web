import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Stagger, StaggerItem } from "@/components/motion";
import { ButtonLink, Card, Container } from "@/components/ui";
import { formatUsd, PLANS } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "$20 per month for the software. 5% off any term longer than one month.",
};

export default function PricingPage() {
  const t = useTranslations("pricing");

  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-3xl">
        <h1 className="display text-4xl font-semibold sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-6 text-lg text-fg-muted">{t("intro")}</p>
      </div>

      {/* Every figure comes from the pricing engine (P2-301). If a number here
          disagrees with checkout, the bug is in the engine, not in two places. */}
      <div className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
              <th scope="col" className="py-3 pr-4 font-medium">
                {t("table.term")}
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                {t("table.price")}
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                {t("table.perMonth")}
              </th>
              <th scope="col" className="py-3 font-medium">
                {t("table.youSave")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PLANS.map((plan) => (
              <tr key={plan.months}>
                <th scope="row" className="py-4 pr-4 font-medium">
                  {plan.months === 1
                    ? t("term.one")
                    : t("term.other", { months: plan.months })}
                </th>
                <td className="py-4 pr-4 tabular-nums">
                  {formatUsd(plan.totalCents)}
                </td>
                <td className="py-4 pr-4 tabular-nums text-fg-muted">
                  {t("perMonth", { price: formatUsd(plan.perMonthCents) })}
                </td>
                <td className="py-4 tabular-nums">
                  {plan.discountCents > 0 ? (
                    <span className="text-accent">
                      {formatUsd(plan.discountCents)}
                    </span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10">
        <ButtonLink href="/app/signup">{t("cta")}</ButtonLink>
      </div>

      <Stagger className="mt-16 grid max-w-4xl gap-6 md:grid-cols-2">
        {/* The performance fee is disclosed on the pricing page, not buried.
            It is charged by Vantage, but it is still money the investor pays. */}
        <StaggerItem>
          <Card>
            <h2 className="text-lg font-semibold">
              {t("performanceFee.title")}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("performanceFee.body")}
            </p>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <h2 className="text-lg font-semibold">{t("noRefund.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              {t("noRefund.body")}
            </p>
          </Card>
        </StaggerItem>
      </Stagger>
    </Container>
  );
}
