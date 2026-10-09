import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/service";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import { liquidityFrom } from "@/lib/admin/liquidity";
import { formatNgn, formatUsdt } from "@/lib/money";
import { summarise } from "@/lib/billing-summary";
import { isAlatPayConfigured } from "@/lib/alatpay";
import { formatUsd } from "@/lib/pricing";
import type { Investor, Subscription } from "@/lib/supabase/types";
import { envOr } from "@/lib/env";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums ${muted ? "text-fg-muted" : ""}`}
      >
        {value}
      </p>
    </Card>
  );
}

/**
 * A queue that needs attention. Accented when there is work and quiet when
 * there is not — a card that always looks urgent stops meaning anything.
 */
function Queue({
  label,
  count,
  href,
  cta,
}: {
  label: string;
  count: number;
  href: string;
  cta: string;
}) {
  const waiting = count > 0;

  return (
    <div
      className={`surface flex items-center justify-between gap-4 rounded-xl border p-5 ${
        waiting ? "border-accent/40" : "border-border"
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
            waiting
              ? "bg-accent text-[#0A0A0A]"
              : "border border-border text-fg-muted"
          }`}
        >
          {waiting ? (
            <AlertCircle className="size-5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-5" aria-hidden="true" />
          )}
        </span>
        <div>
          <p className="text-sm text-fg-muted">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{count}</p>
        </div>
      </div>

      {waiting ? (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] hover:bg-accent-hot"
        >
          {cta}
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}

export default async function AdminHomePage() {
  const t = await getTranslations("adminHome");
  const service = createServiceClient();

  const [investorsResult, subsResult] = await Promise.all([
    service.from("investors").select("*").order("created_at", { ascending: false }),
    service.from("subscriptions").select("*"),
  ]);

  const investors = (investorsResult.data ?? []) as Investor[];
  const subscriptions = (subsResult.data ?? []) as Subscription[];
  const summary = summarise(subscriptions);
  const liquidity = liquidityFrom(subscriptions);

  // Admins are in-house, not customers. An admin may also hold a customer
  // account, and counting them as one inflates the headcount read as "the
  // book" — so they come out of it here.
  const { data: adminRows } = await service.from("app_admins").select("user_id");
  const adminIds = new Set((adminRows ?? []).map((r) => r.user_id as string));
  const customers = investors.filter((i) => !adminIds.has(i.user_id));

  // Claimed a login, nobody has checked it yet. This is the queue that holds
  // an investor up, so it leads the page.
  const claimsWaiting = customers.filter(
    (i) => i.vantage_account_id && !i.linked_at,
  ).length;

  const linked = customers.filter((i) => i.linked_at).length;
  const trading = customers.filter((i) => i.status === "active").length;

  const botConnected = createRmServerClient() !== null;
  const cryptoTestnet = envOr(process.env.TRON_API_URL, "").includes("nile");

  return (
    <div>
      <h1 className="display text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t("intro")}</p>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("needsYou")}
        </h2>
        <div className="mt-3 space-y-3">
          <Queue
            label={t("claims")}
            count={claimsWaiting}
            href="/app/admin/links"
            cta={t("claimsCta")}
          />
          <Queue
            label={t("detach")}
            count={summary.lapsed}
            href="/app/admin/billing"
            cta={t("detachCta")}
          />
        </div>
      </section>

      {/* LIQUIDITY FIRST. "How much have we got, and where is it" is the
          question an owner opens this page with. Split by rail and shown in
          the currency each rail actually holds, because "$4,000" is no use
          when some of it is naira in a bank and some is USDT on a chain. */}
      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("liquidity")}
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label={t("collectedTotal")}
            value={formatUsd(liquidity.totalUsdCents)}
          />
          <Stat
            label={t("inNgn")}
            value={formatNgn(liquidity.ngnKobo.amount)}
          />
          <Stat
            label={t("inUsdt")}
            value={formatUsdt(liquidity.usdtMicro.amount)}
          />
        </dl>
        {/* Said plainly: this is what we have TAKEN, not a bank balance. The
            two drift the first time somebody spends any of it. */}
        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-fg-muted">
          {t("liquidityNote")}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("money")}
        </h2>
        {/* The separation the whole dashboard turns on. */}
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-fg-muted">
          {t("moneyNote")}
        </p>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("revenue")} value={formatUsd(summary.revenueThisMonthUsd)} />
          <Stat label={t("paidUp")} value={String(summary.paidUp)} />
          <Stat label={t("expiring")} value={String(summary.expiringSoon)} />
          <Stat label={t("awaiting")} value={String(summary.awaiting)} muted />
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("people")}
        </h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat label={t("investors")} value={String(customers.length)} />
          <Stat label={t("linked")} value={String(linked)} />
          <Stat label={t("trading")} value={String(trading)} />
        </dl>
      </section>

      {/* What is switched on and what is pretending to be. Both of these have
          caught people out today, so they belong on the page an admin opens
          first rather than in a config file. */}
      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("health")}
        </h2>
        <div className="mt-3 space-y-2">
          <HealthRow
            label={t("botFeed")}
            ok={botConnected}
            detail={botConnected ? t("botFeedUp") : t("botFeedDown")}
          />
          <HealthRow
            label={t("payments")}
            ok={isAlatPayConfigured() && !cryptoTestnet}
            detail={
              !isAlatPayConfigured()
                ? t("paymentsOff")
                : cryptoTestnet
                  ? t("paymentsPartial")
                  : t("paymentsUp")
            }
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("recent")}
        </h2>
        {investors.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">{t("recentNone")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("status")}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    MT5
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {t("joined")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {investors.slice(0, 10).map((investor) => (
                  <tr key={investor.id}>
                    <td className="py-2.5 pr-4">{investor.status}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-fg-muted">
                      {investor.vantage_account_id ?? "—"}
                    </td>
                    <td className="py-2.5 text-fg-muted">
                      {new Date(investor.created_at).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function HealthRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="surface flex items-start gap-3 rounded-lg border border-border px-4 py-3">
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2 shrink-0 rounded-full ${
          ok ? "bg-chart-up" : "bg-accent"
        }`}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{detail}</p>
      </div>
    </div>
  );
}
