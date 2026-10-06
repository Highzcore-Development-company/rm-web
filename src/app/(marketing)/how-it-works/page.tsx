import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { ButtonLink, Card, Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "You open your own Vantage account, fund it, and grant trade permission only. We never hold your funds.",
};

export default function HowItWorksPage() {
  const t = useTranslations("howItWorks");
  const steps = ["open", "fund", "lpoa", "trade", "disconnect"] as const;

  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-6 text-lg text-fg-muted">{t("intro")}</p>
      </div>

      <Stagger as="ol" className="mt-12 max-w-3xl space-y-6">
        {steps.map((key, index) => (
          <StaggerItem as="li" key={key} className="flex gap-5">
            <span
              aria-hidden="true"
              className="mt-1 shrink-0 text-sm font-semibold tabular-nums text-accent"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="text-lg font-semibold">{t(`steps.${key}.title`)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                {t(`steps.${key}.body`)}
              </p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* P2-102 — states plainly that we never hold funds. Not a footnote. */}
      <Reveal>
        <Card className="mt-12 max-w-3xl border-accent/40">
          <h2 className="text-lg font-semibold">{t("custody.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {t("custody.body")}
          </p>
        </Card>
      </Reveal>

      <div className="mt-12">
        <ButtonLink href="/app/signup">{t("cta")}</ButtonLink>
      </div>
    </Container>
  );
}
