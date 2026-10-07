import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requirePermission } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { DetachButton } from "@/components/admin/detach-button";
import { RecheckButton } from "@/components/admin/recheck-button";
import { RefundButton } from "@/components/admin/refund-button";
import { entitlementFrom } from "@/lib/entitlement";
import { summarise } from "@/lib/billing-summary";
import { formatUsd } from "@/lib/pricing";
import type {
  Investor,
  PaymentMethod,
  Subscription,
} from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const METHODS: PaymentMethod[] = [
  "alatpay_transfer",
  "alatpay_card",
  "usdt_trc20",
];

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
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd
        className={`mt-2 text-3xl font-semibold tabular-nums ${
          muted ? "text-fg-muted" : ""
        }`}
      >
        {value}
      </dd>
    </Card>
  );
}

/**
 * P2-313 + A9 — who is paid up, who is expiring, what has been earned.
 *
 * A2: guarded by finance.view, not by "is an admin". Support can disable an
 * abusive account without being shown the company's revenue, and the guard is
 * here on the server rather than in the sidebar — the nav hiding this link is
 * a convenience, not the permission.
 */
export default async function AdminBillingPage() {
  if (!(await requirePermission("finance.view"))) notFound();

  const t = await getTranslations("adminBilling");
  const service = createServiceClient();

  const [subsResult, investorsResult] = await Promise.all([
    service.from("subscriptions").select("*"),
    service.from("investors").select("*"),
  ]);

  const subscriptions = (subsResult.data ?? []) as Subscription[];
  const investors = (investorsResult.data ?? []) as Investor[];
  const summary = summarise(subscriptions);

  // A9 — names for the renewal queue. summarise() is pure and returns investor
  // ids; "9 people renew this week" is a number, "these nine" is a task.
  // Capped at ten: this is a prompt to act, not a mailing list.
  const renewalRows = await Promise.all(
    summary.upcomingRenewals.slice(0, 10).map(async (row) => {
      const investor = investors.find((i) => i.id === row.investorId);
      const account = investor?.user_id
        ? await service.auth.admin.getUserById(investor.user_id)
        : null;
      return {
        ...row,
        email: account?.data?.user?.email ?? "(unknown)",
      };
    }),
  );

  // Money arrived and could not be credited. Leads the page because somebody
  // is out of pocket and waiting, which outranks every other number here.
  const { data: stuckInvoices } = await service
    .from("crypto_invoices")
    .select("*")
    .not("problem", "is", null)
    .order("problem_at", { ascending: false });

  const stuckPayments = subscriptions.filter((s) => s.problem);

  const awaiting = subscriptions
    .filter((s) => s.status === "awaiting")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const confirmed = subscriptions
    .filter((s) => s.status === "confirmed")
    .sort((a, b) => ((a.starts_at ?? "") < (b.starts_at ?? "") ? 1 : -1));

  // Who should no longer be copied, by name. A count with no names cannot be
  // acted on, and acting on it is the entire point of P2-311.
  //
  // THREE reasons land here, not one. The bot trades a single master account
  // and has no per-user loop — investors receive trades through the MAM — so
  // "stop trading this person" is never something the bot does. It is a
  // detachment at the broker, and it is the same operator step whether they
  // lapsed, were disabled, or were deleted. Listing only the lapsed left the
  // other two silently still being copied after an admin thought they had
  // dealt with them.
  //
  // Only accounts still marked as tradeable: once an admin records the
  // detachment the row leaves this list, so the queue drains rather than
  // listing the same people forever.
  const toDetach = investors
    .filter((i) => i.status === "linked" || i.status === "active")
    .map((investor) => ({
      investor,
      entitlement: entitlementFrom(
        subscriptions.filter((s) => s.investor_id === investor.id),
      ),
    }))
    .map((row) => ({
      ...row,
      reason: row.investor.deleted_at
        ? ("deleted" as const)
        : row.investor.disabled_at
          ? ("disabled" as const)
          : row.entitlement.lapsed
            ? ("lapsed" as const)
            : null,
    }))
    .filter((row) => row.reason !== null);

  return (
    <div>
      <h1 className="display text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        {t("intro")}
      </p>

      <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("paidUp")} value={String(summary.paidUp)} />
        <Stat label={t("expiringSoon")} value={String(summary.expiringSoon)} />
        <Stat label={t("lapsed")} value={String(summary.lapsed)} />
        <Stat
          label={t("awaiting")}
          value={String(summary.awaiting)}
          muted
        />
        <Stat label={t("failed")} value={String(summary.failed)} muted />
        {/* Shown even at zero: a refund silently netted off revenue with no
            figure anywhere is how the numbers stop being trusted. */}
        <Stat
          label={t("refunded")}
          value={formatUsd(summary.refundedUsd)}
          muted
        />
      </dl>

      {/* A9. Three different questions, so three figures rather than one
          "revenue" number that quietly means whichever the reader assumes:
          cash this month, cash ever, and the run rate. They do not
          reconcile with each other and are not supposed to. */}
      <dl className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <dt className="text-xs uppercase tracking-wide text-fg-muted">
            {t("revenue")}
          </dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">
            {formatUsd(summary.revenueThisMonthUsd)}
          </dd>
        </Card>
        <Card>
          <dt className="text-xs uppercase tracking-wide text-fg-muted">
            {t("revenueAllTime")}
          </dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">
            {formatUsd(summary.revenueAllTimeUsd)}
          </dd>
        </Card>
        <Card>
          <dt className="text-xs uppercase tracking-wide text-fg-muted">
            {t("mrr")}
          </dt>
          <dd className="mt-2 text-3xl font-semibold tabular-nums">
            {formatUsd(summary.mrrUsd)}
          </dd>
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            {t("mrrNote")}
          </p>
        </Card>
      </dl>

      <div className="mt-10 max-w-xl">
        <Card>
          <h2 className="text-xs uppercase tracking-wide text-fg-muted">
            {t("byMethod")}
          </h2>
          {/* Both columns, because "USDT is 6% of this month" and "USDT is 6%
              of everything" lead to different decisions about which rails to
              keep paying for. */}
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-2 text-left font-medium">
                  {t("method.heading")}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t("thisMonth")}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t("allTime")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {METHODS.map((m) => (
                <tr key={m}>
                  <th scope="row" className="py-3 text-left font-normal text-fg-muted">
                    {t(`method.${m}`)}
                  </th>
                  <td className="py-3 text-right tabular-nums">
                    {formatUsd(summary.revenueByMethod[m])}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {formatUsd(summary.revenueAllTimeByMethod[m])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* A9 — who to chase, by name and by date. */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("renewalsTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          {t("renewalsIntro")}
        </p>

        {renewalRows.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">{t("renewalsNone")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {renewalRows.map((row) => (
              <li
                key={row.investorId}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
              >
                <span>{row.email}</span>
                <span className="tabular-nums text-fg-muted">
                  {/* Days, then the date. The number is what you act on; the
                      date is what you quote to the person. */}
                  {t("renewalsIn", { days: row.daysRemaining })} ·{" "}
                  {row.expiresAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("problemsTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          {t("problemsIntro")}
        </p>

        {(stuckInvoices ?? []).length === 0 && stuckPayments.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">{t("problemsNone")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(stuckInvoices ?? []).map((invoice) => (
              <li
                key={invoice.id}
                className="rounded-xl border border-chart-down/40 bg-chart-down/5 p-4"
              >
                <p className="text-sm font-medium">
                  {t(`problem.${invoice.problem}`)}
                </p>
                <p className="mt-1 text-sm text-fg-muted">
                  {invoice.problem_detail}
                </p>
                <p className="mt-2 font-mono text-xs text-fg-muted">
                  {invoice.address}
                </p>
              </li>
            ))}
            {stuckPayments.map((payment) => (
              <li
                key={payment.id}
                className="rounded-xl border border-chart-down/40 bg-chart-down/5 p-4"
              >
                <p className="text-sm font-medium">
                  {t(`problem.${payment.problem}`)}
                </p>
                <p className="mt-1 text-sm text-fg-muted">
                  {payment.problem_detail}
                </p>
                <p className="mt-2 font-mono text-xs text-fg-muted">
                  {formatUsd(payment.amount_usd)} · {payment.provider_ref ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What has actually been paid, and what has not. The headline figures
          above answer "how much"; an admin asking "did this person's money
          arrive" needs the rows. */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("awaitingTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          {t("awaitingIntro")}
        </p>

        {awaiting.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">{t("awaitingNone")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.when")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.method")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.amount")}</th>
                  <th scope="col" className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {awaiting.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-4 text-fg-muted">
                      {new Date(s.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="py-3 pr-4">{t(`method.${s.method}`)}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatUsd(s.amount_usd)}
                    </td>
                    <td className="py-3">
                      <RecheckButton subscriptionId={s.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("paymentsTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          {t("paymentsIntro")}
        </p>

        {confirmed.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">{t("paymentsNone")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.when")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.method")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.amount")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.ref")}</th>
                  <th scope="col" className="py-2 font-medium">{t("cols.refund")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {confirmed.slice(0, 20).map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 pr-4 text-fg-muted">
                      {s.starts_at
                        ? new Date(s.starts_at).toLocaleDateString("en-GB")
                        : "—"}
                    </td>
                    <td className="py-3 pr-4">{t(`method.${s.method}`)}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatUsd(s.amount_usd)}
                    </td>
                    {/* The provider's own reference, so a figure here can be
                        matched against the bank or the chain. */}
                    <td className="py-3 pr-4 font-mono text-xs text-fg-muted">
                      {s.provider_ref ?? "—"}
                    </td>
                    <td className="py-3">
                      <RefundButton
                        subscriptionId={s.id}
                        amountUsd={s.amount_usd}
                        refundedUsd={s.refunded_usd}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("detachTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          {t("detachIntro")}
        </p>

        {toDetach.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">{t("detachNone")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("table.login")}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("table.expired")}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("table.status")}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("table.reason")}
                  </th>
                  <th scope="col" className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {toDetach.map(({ investor, entitlement, reason }) => (
                  <tr key={investor.id}>
                    <th scope="row" className="py-3 pr-4 font-mono text-xs font-normal">
                      {investor.vantage_account_id ?? "—"}
                    </th>
                    <td className="py-3 pr-4 text-fg-muted">
                      {entitlement.expiresAt
                        ? entitlement.expiresAt.toLocaleDateString("en-GB")
                        : "never paid"}
                    </td>
                    <td className="py-3 pr-4 text-fg-muted">{investor.status}</td>
                    <td className="py-3 pr-4">
                      {/* Why this person is here. Deleted and disabled are not
                          "expired" and the operator needs to know which, since
                          a lapsed investor may well pay and come back. */}
                      <span
                        className={
                          reason === "lapsed"
                            ? "text-fg-muted"
                            : "font-medium text-chart-down"
                        }
                      >
                        {t(`detachReason.${reason}`)}
                      </span>
                    </td>
                    <td className="py-3">
                      <DetachButton investorId={investor.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Said on the page, because nothing automates it and a list sitting
            there unexplained reads as something already handled. */}
        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-fg-muted">
          {t("detachNote")}
        </p>
      </section>
    </div>
  );
}
