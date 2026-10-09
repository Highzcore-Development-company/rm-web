import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { UserFilters } from "@/components/admin/user-filters";
import { requirePermission } from "@/lib/admin";
import { countUsers, listUsers, DEFAULT_PER_PAGE } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Users", robots: { index: false } };
export const dynamic = "force-dynamic";

type StatusFilter =
  | "active"
  | "grace"
  | "lapsed"
  | "never"
  | "disabled"
  | "deleted";

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

/** A3 — the users list. */
export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/app/admin/users">) {
  // The guard, not the nav. Reaching this URL without the permission is a 404
  // whatever the sidebar happened to render.
  if (!(await requirePermission("users.view"))) notFound();

  const t = await getTranslations("adminUsers");
  const params = await searchParams;

  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? undefined;

  const search = one(params.q);
  const status = one(params.status) as StatusFilter | undefined;
  const page = Number(one(params.page) ?? 1) || 1;

  const [{ rows, total }, totalUsers] = await Promise.all([
    listUsers({ search, status, page }),
    countUsers(),
  ]);

  const from = total === 0 ? 0 : (page - 1) * DEFAULT_PER_PAGE + 1;
  const to = Math.min(page * DEFAULT_PER_PAGE, total);

  const pageHref = (n: number) => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (status) next.set("status", status);
    next.set("page", String(n));
    return `/app/admin/users?${next}`;
  };

  return (
    <div>
      <h1 className="display text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t("intro")}</p>

      <div className="mt-6 max-w-xs">
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">
            {t("total")}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {totalUsers.toLocaleString("en-US")}
          </p>
        </Card>
      </div>

      <div className="mt-8">
        <UserFilters search={search ?? ""} status={status ?? ""} />
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.email")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.signedUp")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.verified")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.risk")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.subscription")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.broker")}</th>
                  <th scope="col" className="py-2 font-medium">{t("cols.lastSeen")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.investorId}
                    className={row.deletedAt ? "opacity-50" : undefined}
                  >
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <Link
                        href={`/app/admin/users/${row.investorId}`}
                        className="text-accent underline underline-offset-2"
                      >
                        {row.email}
                      </Link>
                      {/* An admin is an in-house person who was invited into
                          this panel — not every colleague is one. They may
                          also be a customer, so the badge is how you avoid
                          chasing a teammate for a renewal. */}
                      {row.isAdmin ? (
                        <span className="ml-2 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                          {t("adminBadge")}
                        </span>
                      ) : null}
                      {row.disabledAt ? (
                        <span className="ml-2 rounded-full border border-chart-down/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-chart-down">
                          {t("state.disabled")}
                        </span>
                      ) : null}
                    </th>
                    <td className="py-3 pr-4 text-fg-muted">{day(row.signedUpAt)}</td>
                    <td className="py-3 pr-4 text-fg-muted">
                      {row.verified ? t("yes") : t("no")}
                    </td>
                    <td className="py-3 pr-4 text-fg-muted">
                      {row.riskAcknowledged ? t("yes") : t("no")}
                    </td>
                    <td className="py-3 pr-4">{t(`state.${row.subscription}`)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-fg-muted">
                      {row.vantageAccountId ?? "—"}
                    </td>
                    <td className="py-3 text-fg-muted">
                      {row.lastSeenAt ? day(row.lastSeenAt) : t("never")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 text-sm">
            <span className="text-fg-muted">
              {t("showing", { from, to, total })}
            </span>
            <span className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-fg-muted"
                >
                  {t("prev")}
                </Link>
              ) : null}
              {to < total ? (
                <Link
                  href={pageHref(page + 1)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-fg-muted"
                >
                  {t("next")}
                </Link>
              ) : null}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
