import { useTranslations } from "next-intl";
import { PerformanceStrip } from "@/components/performance-strip";
import { ButtonLink, Card, Container, Eyebrow, Section } from "@/components/ui";
import { formatUsd, MONTHLY_PRICE_CENTS } from "@/lib/pricing";

function Hero() {
  const t = useTranslations("home.hero");

  return (
    <Container className="py-20 sm:py-28">
      <div className="max-w-3xl">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          {t("title")}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
          {t("body")}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/app/signup">{t("primaryCta")}</ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary">
            {t("secondaryCta")}
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}

function Steps() {
  const t = useTranslations("home.steps");
  const keys = ["one", "two", "three"] as const;

  return (
    <Section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("title")}
      </h2>
      <ol className="mt-10 grid gap-6 md:grid-cols-3">
        {keys.map((key, index) => (
          <li key={key}>
            <Card className="h-full">
              <span
                aria-hidden="true"
                className="text-sm font-semibold text-accent"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold">
                {t(`${key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                {t(`${key}.body`)}
              </p>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function PricingTeaser() {
  const t = useTranslations("home.pricing");

  return (
    <Section>
      <Card className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {/* Price comes from the pricing engine, never a literal in copy. */}
            {t("title", { price: formatUsd(MONTHLY_PRICE_CENTS) })}
          </h2>
          <p className="mt-2 text-sm text-fg-muted">{t("body")}</p>
        </div>
        <ButtonLink href="/pricing">{t("cta")}</ButtonLink>
      </Card>
    </Section>
  );
}

function Faq() {
  const t = useTranslations("home.faq");
  const keys = ["custody", "stop", "cost", "losses", "broker"] as const;

  return (
    <Section>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("title")}
      </h2>
      <dl className="mt-10 divide-y divide-border border-y border-border">
        {keys.map((key) => (
          <div key={key} className="py-6">
            <dt className="text-base font-semibold">{t(`items.${key}.q`)}</dt>
            <dd className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-muted">
              {t(`items.${key}.a`)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <PerformanceStrip />
      <Steps />
      <PricingTeaser />
      <Faq />
    </>
  );
}
