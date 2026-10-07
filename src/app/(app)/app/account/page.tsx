import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { NotificationSwitches } from "@/components/dashboard/notification-switches";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import { getLivePositions, getClosedTrades } from "@/lib/positions";
import { entitlementFrom } from "@/lib/entitlement";
import { formatUsd } from "@/lib/pricing";
import type { Subscription } from "@/lib/supabase/types";
import type { SwitchKey } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const DEFAULT_SWITCHES: Record<SwitchKey, boolean> = {
  trade_opened: true,
  trade_closed: true,
  subscription_expiring: true,
  bot_switched_off: true,
};

function day(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const supabase = await createClient();
  const investor = await getInvestor(supabase);

  // Everything in parallel: four independent reads, and one of them (the bot's
  // project) is a different host entirely.
  const [subsResult, prefsResult, positions, trades] = await Promise.all([
    investor
      ? supabase
          .from("subscriptions")
          .select("*")
          .eq("investor_id", investor.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Subscription[] }),
    investor
      ? supabase
          .from("notification_preferences")
          .select("*")
          .eq("investor_id", investor.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getLivePositions(),
    getClosedTrades(),
  ]);

  const subscriptions = (subsResult.data ?? []) as Subscription[];
  const entitlement = entitlementFrom(subscriptions);
  const confirmed = subscriptions.filter((s) => s.status === "confirmed");

  const prefs = {
    ...DEFAULT_SWITCHES,
    ...((prefsResult.data as Partial<Record<SwitchKey, boolean>> | null) ?? {}),
  };

  return (
    <AppShell active="overview">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* P2-502 — my account */}
        <Card>
          <h2 className="text-lg font-semibold">{t("account.title")}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">{t("account.status")}</dt>
              <dd>{investor ? investor.status : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">{t("account.login")}</dt>
              <dd className="font-mono">
                {investor?.vantage_account_id ?? t("account.notLinked")}
              </dd>
            </div>
          </dl>
          {/* Said plainly rather than showing an empty "Balance —" row that
              looks like something failed to load. */}
          <p className="mt-4 text-xs leading-relaxed text-fg-muted">
            {t("account.balanceUnavailable")}
          </p>
          <Link
            href="/app/link-account"
            className="mt-4 inline-block text-sm text-accent underline underline-offset-2"
          >
            {t("account.cta")}
          </Link>
        </Card>

        {/* P2-505 — subscription panel */}
        <Card>
          <h2 className="text-lg font-semibold">{t("subscription.title")}</h2>

          <p className="mt-4 text-sm">
            {entitlement.active
              ? t("subscription.active", { date: day(entitlement.expiresAt?.toISOString()) })
              : entitlement.inGrace
                ? t("subscription.grace", {
                    date: day(entitlement.expiresAt?.toISOString()),
                  })
                : confirmed.length > 0
                  ? t("subscription.lapsed")
                  : t("subscription.never")}
          </p>

          <Link
            href="/app/checkout"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-[#0A0A0A] hover:bg-accent-hot"
          >
            {confirmed.length > 0 ? t("subscription.renew") : t("subscription.subscribe")}
          </Link>

          <h3 className="mt-8 text-xs uppercase tracking-wide text-fg-muted">
            {t("subscription.history")}
          </h3>
          {confirmed.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">
              {t("subscription.noPayments")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-t border-border text-sm">
              {confirmed.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 py-3">
                  <span>
                    {s.months === 1
                      ? t("subscription.termOne")
                      : t("subscription.term", { months: s.months })}
                    <span className="ml-2 text-fg-muted">{day(s.starts_at)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{formatUsd(s.amount_usd)}</span>
                    <a
                      href={`/app/receipts/${s.id}`}
                      className="text-accent underline underline-offset-2"
                    >
                      {t("subscription.receipt")}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* P2-503 — live positions */}
      <section className="mt-8">
        <Card>
          <h2 className="text-lg font-semibold">{t("positions.title")}</h2>
          {/* States that these are the master's, mirrored in proportion. We
              have not read their account and must not imply we have. */}
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-fg-muted">
            {t("positions.subtitle")}
          </p>

          {positions === null ? (
            <p className="mt-4 text-sm text-fg-muted">
              {t("positions.unavailable")}
            </p>
          ) : positions.length === 0 ? (
            <p className="mt-4 text-sm text-fg-muted">{t("positions.empty")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">{t("positions.symbol")}</th>
                    <th scope="col" className="py-2 pr-4 font-medium">{t("positions.side")}</th>
                    <th scope="col" className="py-2 pr-4 font-medium">{t("positions.opened")}</th>
                    <th scope="col" className="py-2 font-medium">{t("positions.price")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {positions.map((p) => (
                    <tr key={p.ticket}>
                      <th scope="row" className="py-2 pr-4 font-mono text-xs font-normal">
                        {p.symbol}
                      </th>
                      <td className="py-2 pr-4 text-fg-muted">{p.side}</td>
                      <td className="py-2 pr-4 text-fg-muted">{day(p.openedAt)}</td>
                      <td className="py-2 tabular-nums">{p.openPrice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* P2-504 — my trade history */}
      <section className="mt-8">
        <Card>
          <h2 className="text-lg font-semibold">{t("trades.title")}</h2>
          <p className="mt-2 text-xs text-fg-muted">{t("trades.subtitle")}</p>

          {trades === null ? (
            <p className="mt-4 text-sm text-fg-muted">{t("trades.unavailable")}</p>
          ) : trades.length === 0 ? (
            <p className="mt-4 text-sm text-fg-muted">{t("trades.empty")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">{t("trades.symbol")}</th>
                    <th scope="col" className="py-2 pr-4 font-medium">{t("trades.side")}</th>
                    <th scope="col" className="py-2 pr-4 font-medium">{t("trades.closed")}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t("trades.result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trades.map((tr) => (
                    <tr key={tr.ticket}>
                      <th scope="row" className="py-2 pr-4 font-mono text-xs font-normal">
                        {tr.symbol}
                      </th>
                      <td className="py-2 pr-4 text-fg-muted">{tr.side}</td>
                      <td className="py-2 pr-4 text-fg-muted">{day(tr.closedAt)}</td>
                      {/* Sign in the text, not only the colour — the palette's
                          green/red is below the colourblind separation floor. */}
                      <td
                        className={`py-2 text-right tabular-nums ${
                          (tr.profit ?? 0) >= 0 ? "text-chart-up" : "text-chart-down"
                        }`}
                      >
                        <span aria-hidden="true">
                          {(tr.profit ?? 0) >= 0 ? "▲ " : "▼ "}
                        </span>
                        {tr.profit === null
                          ? "—"
                          : `${tr.profit > 0 ? "+" : ""}${tr.profit.toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* P2-506 — notifications */}
      <section className="mt-8 max-w-xl">
        <Card>
          <h2 className="text-lg font-semibold">{t("notifications.title")}</h2>
          <NotificationSwitches initial={prefs} />
        </Card>
      </section>
    </AppShell>
  );
}
