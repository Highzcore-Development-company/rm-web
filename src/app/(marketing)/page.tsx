import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  LineChart,
  Lock,
  ShieldCheck,
  Unlock,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Lift, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { PerformanceStrip } from "@/components/performance-strip";
import { ButtonLink, Card, Container, Eyebrow, Section } from "@/components/ui";
import { formatUsd, MONTHLY_PRICE_CENTS } from "@/lib/pricing";

function Hero() {
  const t = useTranslations("home.hero");

  const trust: { key: "custody" | "permission" | "cancel"; Icon: LucideIcon }[] =
    [
      { key: "custody", Icon: Wallet },
      { key: "permission", Icon: Lock },
      { key: "cancel", Icon: Unlock },
    ];

  return (
      <Container className="py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <Stagger>
            <StaggerItem>
              <Eyebrow>{t("eyebrow")}</Eyebrow>
            </StaggerItem>
            <StaggerItem>
              <h1 className="display mt-5 text-4xl font-semibold sm:text-5xl md:text-6xl">
                {t("title")}
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-fg-muted">
                {t("body")}
              </p>
            </StaggerItem>
            <StaggerItem className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/app/signup">{t("primaryCta")}</ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary">
                {t("secondaryCta")}
              </ButtonLink>
            </StaggerItem>

            {/* The three objections everyone arrives with, answered before
                they have to go looking. This is the persuasion — not a claim
                about returns, which we have not earned the right to make. */}
            <StaggerItem className="mt-10">
              <ul className="space-y-2.5">
                {trust.map(({ key, Icon }) => (
                  <li key={key} className="flex items-center gap-3 text-sm">
                    <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="text-fg-muted">{t(`trust.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </StaggerItem>
          </Stagger>

          <Reveal delay={0.2}>
            <HeroVisual />
          </Reveal>
        </div>
      </Container>
  );
}

function Steps() {
  const t = useTranslations("home.steps");
  const steps: { key: "one" | "two" | "three"; Icon: LucideIcon }[] = [
    { key: "one", Icon: UserPlus },
    { key: "two", Icon: ShieldCheck },
    { key: "three", Icon: LineChart },
  ];

  return (
    <Section>
      <Reveal as="h2" className="display text-2xl font-semibold sm:text-4xl">
        {t("title")}
      </Reveal>
      <Stagger as="ol" className="mt-10 grid gap-5 md:grid-cols-3">
        {steps.map(({ key, Icon }, index) => (
          <StaggerItem as="li" key={key}>
            <Lift className="h-full">
              <Card className="h-full">
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-2xl font-semibold tabular-nums text-border"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">
                  {t(`${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                  {t(`${key}.body`)}
                </p>
              </Card>
            </Lift>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

/** The case for trusting us, made from facts rather than adjectives. */
function Proof() {
  const t = useTranslations("home.proof");
  const items: { key: "custody" | "record" | "control"; Icon: LucideIcon }[] = [
    { key: "custody", Icon: Lock },
    { key: "record", Icon: LineChart },
    { key: "control", Icon: BadgeCheck },
  ];

  return (
    <Section>
      <Reveal as="h2" className="display text-2xl font-semibold sm:text-4xl">
        {t("title")}
      </Reveal>
      <Stagger className="mt-10 grid gap-5 md:grid-cols-3">
        {items.map(({ key, Icon }) => (
          <StaggerItem key={key}>
            <Lift className="h-full">
              <Card className="h-full">
                <span className="flex size-11 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">
                  {t(`${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                  {t(`${key}.body`)}
                </p>
              </Card>
            </Lift>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

function PricingTeaser() {
  const t = useTranslations("home.pricing");

  return (
    <Section>
      <Reveal>
        <div className="surface-raised relative overflow-hidden rounded-2xl border border-border p-8 sm:p-10">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="display text-3xl font-semibold sm:text-4xl">
                {/* Price comes from the pricing engine, never a literal. */}
                {t("title", { price: formatUsd(MONTHLY_PRICE_CENTS) })}
              </h2>
              <p className="mt-3 text-sm text-fg-muted">{t("body")}</p>
            </div>
            <ButtonLink href="/pricing">{t("cta")}</ButtonLink>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

function Faq() {
  const t = useTranslations("home.faq");
  const keys = ["custody", "stop", "cost", "losses", "broker"] as const;

  return (
    <Section>
      <Reveal as="h2" className="display text-2xl font-semibold sm:text-4xl">
        {t("title")}
      </Reveal>
      <Stagger className="mt-10 grid gap-4 md:grid-cols-2">
        {keys.map((key) => (
          <StaggerItem key={key}>
            {/* <details> rather than a JS accordion: it is open-able before
                hydration, searchable by the browser, and keyboard-operable
                without us writing any of that. */}
            <details className="surface group rounded-xl border border-border p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold">
                {t(`items.${key}.q`)}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-accent transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                {t(`items.${key}.a`)}
              </p>
            </details>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <PerformanceStrip />
      <Steps />
      <Proof />
      <PricingTeaser />
      <Faq />
    </>
  );
}
