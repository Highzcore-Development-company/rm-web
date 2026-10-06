import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { summarise } from "@/lib/billing-summary";
import { formatUsd } from "@/lib/pricing";
import type { PaymentMethod } from "@/lib/supabase/types";

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

  const { data } = await service.from("subscriptions").select("*");
  const summary = summarise(data ?? []);

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

      {/* Said on the page, because nothing automates it and a count sitting
          there unexplained reads as something already handled. */}
      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-fg-muted">
        {t("detachNote")}
      </p>
    </div>
  );
}
