import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Check, X } from "lucide-react";
import { Card } from "@/components/ui";
import {
  DeleteUser,
  DisableUser,
  EditUser,
} from "@/components/admin/user-controls";
import { getAdmin, requirePermission } from "@/lib/admin";
import { getUser } from "@/lib/admin/users";
import { formatUsd } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "User",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

function when(value: string | null) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <dt className="text-sm text-fg-muted">{label}</dt>
        {note ? <p className="mt-1 text-xs text-fg-muted/80">{note}</p> : null}
      </div>
      <dd className="shrink-0 text-right text-sm">{value}</dd>
    </div>
  );
}

function YesNo({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-chart-up">
      <Check className="size-3.5" aria-hidden="true" />
      Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-fg-muted">
      <X className="size-3.5" aria-hidden="true" />
      No
    </span>
  );
}

/** A4 — one investor, everything about them. */
export default async function AdminUserPage({
  params,
}: PageProps<"/app/admin/users/[id]">) {
  if (!(await requirePermission("users.view"))) notFound();

  const { id } = await params;
  const t = await getTranslations("adminUsers");

  const detail = await getUser(id);
  if (!detail) notFound();

  const { row, investor, subscriptions, disabledByEmail } = detail;

  // Each control is rendered only with its own permission — and refuses again
  // on the server, because hiding it is presentation, not enforcement.
  const admin = await getAdmin();
  const canEdit = admin?.permissions.includes("users.edit") ?? false;
  const canDisable = admin?.permissions.includes("users.disable") ?? false;
  const canDelete = admin?.permissions.includes("users.delete") ?? false;

  const confirmed = subscriptions.filter((s) => s.status === "confirmed");

  return (
    <div>
      <Link
        href="/app/admin/users"
        className="group inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
        {t("detail.back")}
      </Link>

      <h1 className="display mt-6 text-3xl font-semibold">{row.email}</h1>

      {investor.deleted_at ? (
        <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("detail.deletedBanner", { when: when(investor.deleted_at) })}
        </p>
      ) : investor.disabled_at ? (
        <p className="mt-4 rounded-lg border border-chart-down/40 bg-chart-down/5 px-4 py-3 text-sm">
          {t("detail.disabledBanner", {
            when: when(investor.disabled_at),
            who: disabledByEmail ?? "an admin",
            reason: investor.disabled_reason ?? "—",
          })}
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold">{t("detail.account")}</h2>
          <dl className="mt-3">
            <Fact label={t("detail.userId")} value={<span className="font-mono text-xs">{row.userId}</span>} />
            <Fact label={t("detail.signedUp")} value={when(row.signedUpAt)} />
            <Fact label={t("detail.lastSeen")} value={when(row.lastSeenAt)} />
            <Fact label={t("detail.verified")} value={<YesNo value={row.verified} />} />
            {/* A5 says this is not editable, and the note says why on the page
                rather than only in the code. */}
            <Fact
              label={t("detail.risk")}
              note={t("detail.riskNote")}
              value={
                row.riskAcknowledged ? (
                  <span className="text-sm">{when(investor.risk_acknowledged_at)}</span>
                ) : (
                  <YesNo value={false} />
                )
              }
            />
          </dl>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">{t("detail.broker")}</h2>
          <dl className="mt-3">
            <Fact
              label={t("cols.broker")}
              value={
                row.vantageAccountId ? (
                  <span className="font-mono">{row.vantageAccountId}</span>
                ) : (
                  <span className="text-fg-muted">{t("detail.notLinked")}</span>
                )
              }
            />
            <Fact label={t("detail.linkedAt")} value={when(investor.linked_at)} />
            <Fact label={t("filter")} value={investor.status} />
            <Fact
              label={t("cols.subscription")}
              value={`${t(`state.${row.subscription}`)}${row.expiresAt ? ` · ${when(row.expiresAt)}` : ""}`}
            />
          </dl>
        </Card>
      </div>

      <section className="mt-8">
        <Card>
          <h2 className="text-lg font-semibold">{t("detail.payments")}</h2>
          {confirmed.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t("detail.noPayments")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Paid</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Term</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Amount</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Method</th>
                    <th scope="col" className="py-2 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {confirmed.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-4 text-fg-muted">{when(s.starts_at)}</td>
                      <td className="py-3 pr-4">{s.months} mo</td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatUsd(s.amount_usd)}
                      </td>
                      <td className="py-3 pr-4 text-fg-muted">{s.method}</td>
                      <td className="py-3 text-fg-muted">{when(s.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {!investor.deleted_at ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <EditUser
            investorId={row.investorId}
            email={row.email}
            vantageAccountId={row.vantageAccountId}
            canEdit={canEdit}
          />
          <DisableUser
            investorId={row.investorId}
            disabled={Boolean(investor.disabled_at)}
            canDisable={canDisable}
          />
          <DeleteUser
            investorId={row.investorId}
            email={row.email}
            canDelete={canDelete}
          />
        </div>
      ) : null}
    </div>
  );
}
