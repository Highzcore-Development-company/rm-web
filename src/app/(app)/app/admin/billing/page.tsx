import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { DetachButton } from "@/components/admin/detach-button";
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

/** P2-313 — who is paid up, who is expiring, revenue this month, by method. */
export default async function AdminBillingPage() {
  if (!(await isAdmin())) notFound();

  const t = await getTranslations("adminBilling");
  const service = createServiceClient();

  const [subsResult, investorsResult] = await Promise.all([
    service.from("subscriptions").select("*"),
    service.from("investors").select("*"),
  ]);

  const subscriptions = (subsResult.data ?? []) as Subscription[];
  const investors = (investorsResult.data ?? []) as Investor[];
  const summary = summarise(subscriptions);

  // Who the "lapsed" number actually refers to. A count with no names cannot
  // be acted on, and acting on it is the entire point of P2-311.
  //
  // Only accounts still marked as tradeable: once an admin has detached one
  // it leaves this list, so the queue drains rather than listing the same
  // people forever.
  const toDetach = investors
    .filter((i) => i.status === "linked" || i.status === "active")
    .map((investor) => ({
      investor,
      entitlement: entitlementFrom(
        subscriptions.filter((s) => s.investor_id === investor.id),
      ),
    }))
    .filter((row) => row.entitlement.lapsed);

  return (
    <div>
      <h1 className="display text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        {t("intro")}
      </p>

      <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("paidUp")} value={String(summary.paidUp)} />
        <Stat label={t("expiringSoon")} value={String(summary.expiringSoon)} />
        <Stat label={t("lapsed")} value={String(summary.lapsed)} />
        <Stat
          label={t("awaiting")}
          value={String(summary.awaiting)}
          muted
        />
      </dl>

      <div className="mt-10 max-w-xl">
        <Card>
          <dt className="text-xs uppercase tracking-wide text-fg-muted">
            {t("revenue")}
          </dt>
          <dd className="mt-2 text-4xl font-semibold tabular-nums">
            {formatUsd(summary.revenueThisMonthUsd)}
          </dd>

          <h2 className="mt-8 text-xs uppercase tracking-wide text-fg-muted">
            {t("byMethod")}
          </h2>
          <dl className="mt-3 divide-y divide-border border-t border-border">
            {METHODS.map((m) => (
              <div key={m} className="flex justify-between py-3 text-sm">
                <dt className="text-fg-muted">{t(`method.${m}`)}</dt>
                <dd className="tabular-nums">
                  {formatUsd(summary.revenueByMethod[m])}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

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
                  <th scope="col" className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {toDetach.map(({ investor, entitlement }) => (
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
