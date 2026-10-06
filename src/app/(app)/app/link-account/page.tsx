import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClaimForm } from "@/components/link-account/claim-form";
import { DisconnectButton } from "@/components/link-account/disconnect-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import {
  BROKER_MINIMUM_USD,
  MANAGER_ID,
  PARTNER_LINK,
  RECOMMENDED_MINIMUM_USD,
} from "@/lib/vantage";

export const metadata: Metadata = {
  title: "Link your Vantage account",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

function usd(amount: number) {
  return `$${amount.toLocaleString("en-US")}`;
}

/** P2-201, P2-202, P2-203, P2-205, P2-206. */
export default async function LinkAccountPage() {
  const t = await getTranslations("linkAccount");
  const supabase = await createClient();
  const investor = await getInvestor(supabase);

  const claimed = Boolean(investor?.vantage_account_id);
  const confirmed =
    investor?.status === "linked" || investor?.status === "active";

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
        <h1 className="display text-3xl font-semibold sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {t("intro")}
        </p>
      </div>

      <div className="mt-10 max-w-3xl space-y-6">
        {/* P2-201 — partner link */}
        <Card>
          <h2 className="text-lg font-semibold">{t("partner.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {t("partner.body")}
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-fg-muted">
            {(["one", "two", "three", "four"] as const).map((k) => (
              <li key={k}>{t(`partner.steps.${k}`)}</li>
            ))}
          </ol>
          <a
            href={PARTNER_LINK}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center justify-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
          >
            {t("partner.cta")}
          </a>
          <p className="mt-4 text-xs text-fg-muted">
            {t("partner.screenshotsPending")}
          </p>
        </Card>

        {/* P2-202 — LPOA guidance. Grants and does-not-grant side by side,
            because the second is the part investors are actually worried about. */}
        <Card>
          <h2 className="text-lg font-semibold">{t("lpoa.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {t("lpoa.body")}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold">{t("lpoa.grants")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                {t("lpoa.grantsBody")}
              </p>
            </div>
            <div className="rounded-md border border-accent/40 bg-accent/5 p-4">
              <h3 className="text-sm font-semibold">{t("lpoa.denies")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                {t("lpoa.deniesBody")}
              </p>
            </div>
          </div>

          <dl className="mt-5 text-sm">
            <dt className="text-fg-muted">{t("lpoa.managerId")}</dt>
            <dd className="mt-1 font-mono text-base">{MANAGER_ID}</dd>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-fg-muted">
            {t("lpoa.revoke")}
          </p>
        </Card>

        {/* P2-206 — minimum deposit guidance */}
        <Card>
          <h2 className="text-lg font-semibold">{t("minimum.title")}</h2>
          <ul className="mt-3 space-y-1 text-sm text-fg-muted">
            <li>{t("minimum.brokerMinimum", { amount: usd(BROKER_MINIMUM_USD) })}</li>
            <li>
              {t("minimum.ourMinimum", { amount: usd(RECOMMENDED_MINIMUM_USD) })}
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">
            {t("minimum.why")}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
            {t("minimum.notAdvice")}
          </p>
        </Card>

        {/* P2-203 — capture the login */}
        <Card>
          <h2 className="text-lg font-semibold">{t("claim.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {t("claim.body")}
          </p>

          {confirmed ? (
            <p className="mt-5 rounded-md border border-chart-up/40 bg-chart-up/5 px-4 py-3 text-sm">
              {t("claim.confirmed")}
            </p>
          ) : (
            <>
              {/* Once confirmed the RLS policy stops accepting changes, so the
                  form is not shown rather than shown and silently ignored. */}
              <ClaimForm initialLogin={investor?.vantage_account_id ?? null} />
              {claimed ? (
                <p className="mt-4 text-sm text-fg-muted">{t("claim.pending")}</p>
              ) : null}
            </>
          )}
        </Card>

        {/* P2-205 — disconnect */}
        <Card>
          <h2 className="text-lg font-semibold">{t("disconnect.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {t("disconnect.body")}
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-fg-muted">
            <li>{t("disconnect.stepUs")}</li>
            <li>{t("disconnect.stepYou")}</li>
          </ol>
          <DisconnectButton />
        </Card>
      </div>
    </Container>
  );
}
