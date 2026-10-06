import type { Metadata } from "next";
import Link from "next/link";
import { LogoLink } from "@/components/logo";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  HelpCircle,
  Link2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Stepper } from "@/components/onboarding/stepper";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ensureInvestor, getInvestor } from "@/lib/investors";
import { stepsFor, type Step, type StepKey } from "@/lib/onboarding";
import type { Investor } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Getting set up",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const ICONS: Record<StepKey, LucideIcon> = {
  account: UserPlus,
  fund: Banknote,
  link: Link2,
  subscribe: CreditCard,
};

/** A finished stage. Collapsed to one green line — it is out of the way. */
function DoneRow({ title, label }: { title: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-chart-up/25 bg-chart-up/5 px-5 py-3.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-chart-up text-[#0A0A0A]">
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {title}
      </span>
      <span className="shrink-0 text-xs font-medium text-chart-up">{label}</span>
    </div>
  );
}

/** The stage you are on. The only one with its CTA and full explanation. */
function CurrentCard({
  step,
  title,
  body,
  cta,
}: {
  step: Step;
  title: string;
  body: string;
  cta: string;
}) {
  const Icon = ICONS[step.key];

  return (
    <div className="surface-raised relative overflow-hidden rounded-xl border border-accent/40 p-5 sm:p-6">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative flex gap-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-[#0A0A0A]">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-fg-muted">
            {body}
          </p>
          <Link
            href={step.href}
            className="group mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] shadow-[var(--glow-accent)] transition-all hover:bg-accent-hot"
          >
            {cta}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Not reached yet, or unverifiable. Dimmed, present, not demanding anything. */
function PendingRow({
  step,
  title,
  label,
}: {
  step: Step;
  title: string;
  label: string;
}) {
  const Icon = ICONS[step.key];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-5 py-3.5 opacity-60">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-fg-muted">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
        {!step.verifiable ? (
          <HelpCircle className="size-3" aria-hidden="true" />
        ) : null}
        {label}
      </span>
    </div>
  );
}

export default async function OnboardingPage() {
  const t = await getTranslations("onboarding");
  const supabase = await createClient();

  // Normally created by the auth callback. Retried here because someone whose
  // callback failed would otherwise be signed in with no row and no way to get
  // one — a dead end with no error to point at.
  let investor: Investor | null = await getInvestor(supabase);
  if (!investor) {
    const { data } = await supabase.auth.getUser();
    if (data.user) investor = await ensureInvestor(supabase, data.user.id);
  }

  const steps = stepsFor(investor);

  // The funding stage can never be ticked — we cannot see a Vantage balance.
  // If it counted towards progress the bar could never fill and the flow would
  // stall on a stage nobody can clear, so it is shown but not gating.
  const gating = steps.filter((s) => s.verifiable);
  const currentKey = gating.find((s) => !s.done)?.key ?? null;

  const segments = steps.map((s) => ({
    key: s.key,
    label: t(`steps.${s.key}.title`),
    done: s.done,
    verifiable: s.verifiable,
    current: s.key === currentKey,
  }));

  return (
    <div className="ambient relative">
      <Container className="py-10 sm:py-14">
        <div className="flex items-center justify-between gap-4">
          <LogoLink width={140} />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>

        <Reveal className="mt-12 max-w-2xl">
          <h1 className="display text-3xl font-semibold sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            {t("intro")}
          </p>
        </Reveal>

        <Reveal className="mt-8 max-w-3xl">
          <Stepper segments={segments} />

          {investor ? (
            <p className="surface mt-6 rounded-lg border border-border px-4 py-3 text-sm">
              {t(`status.${investor.status}`)}
            </p>
          ) : (
            <p role="alert" className="mt-6 text-sm text-fg-muted">
              {t("notReady")}
            </p>
          )}
        </Reveal>

        {/* Done stages collapse to a line; the current stage is the only one
            asking anything of you. Four equal cards makes someone work out
            where they are — this answers it before they read a word. */}
        <Stagger as="ol" className="mt-8 max-w-3xl space-y-3">
          {steps.map((step) => (
            <StaggerItem as="li" key={step.key}>
              {step.done ? (
                <DoneRow
                  title={t(`steps.${step.key}.title`)}
                  label={t("done")}
                />
              ) : step.key === currentKey ? (
                <CurrentCard
                  step={step}
                  title={t(`steps.${step.key}.title`)}
                  body={t(`steps.${step.key}.body`)}
                  cta={t(`steps.${step.key}.cta`)}
                />
              ) : (
                <PendingRow
                  step={step}
                  title={t(`steps.${step.key}.title`)}
                  label={t("todo")}
                />
              )}
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </div>
  );
}
