import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ensureInvestor, getInvestor } from "@/lib/investors";
import { stepsFor, type Step } from "@/lib/onboarding";
import type { Investor } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Getting set up",
  robots: { index: false },
};

// Reads the signed-in investor's row, so it can never be prerendered.
export const dynamic = "force-dynamic";

function StepRow({
  step,
  index,
  title,
  body,
  cta,
  doneLabel,
  todoLabel,
}: {
  step: Step;
  index: number;
  title: string;
  body: string;
  cta: string;
  doneLabel: string;
  todoLabel: string;
}) {
  return (
    <li>
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <span
            aria-hidden="true"
            className="mt-0.5 text-sm font-semibold tabular-nums text-accent"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-fg-muted">
              {body}
            </p>
            <Link
              href={step.href}
              className="mt-3 inline-block text-sm text-accent underline underline-offset-2"
            >
              {cta}
            </Link>
          </div>
        </div>

        <div className="shrink-0 sm:pl-6">
          {/* Status is text, not colour alone — a tick that only differs by
              hue is invisible to a red/green colourblind reader. */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              step.done
                ? "border-chart-up/40 text-chart-up"
                : "border-border text-fg-muted"
            }`}
          >
            <span aria-hidden="true">{step.done ? "✓" : "○"}</span>
            {step.done ? doneLabel : todoLabel}
          </span>
        </div>
      </Card>
    </li>
  );
}

export default async function OnboardingPage() {
  const t = await getTranslations("onboarding");
  const supabase = await createClient();

  // Normally created by the auth callback. Retried here because someone whose
  // callback failed would otherwise be signed in with no row and no way to
  // get one — a dead end with no error to point at.
  let investor: Investor | null = await getInvestor(supabase);
  if (!investor) {
    const { data } = await supabase.auth.getUser();
    if (data.user) investor = await ensureInvestor(supabase, data.user.id);
  }

  const steps = stepsFor(investor);

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

        {investor ? (
          <p className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm">
            {t(`status.${investor.status}`)}
          </p>
        ) : (
          <p role="alert" className="mt-6 text-sm text-fg-muted">
            {t("notReady")}
          </p>
        )}
      </div>

      <ol className="mt-10 max-w-3xl space-y-4">
        {steps.map((step, index) => (
          <StepRow
            key={step.key}
            step={step}
            index={index}
            title={t(`steps.${step.key}.title`)}
            body={t(`steps.${step.key}.body`)}
            cta={t(`steps.${step.key}.cta`)}
            doneLabel={t("done")}
            todoLabel={t("todo")}
          />
        ))}
      </ol>
    </Container>
  );
}
