import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LinkActions } from "@/components/admin/link-actions";
import { requirePermission } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Link verification",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * P2-204 — the link verification queue.
 *
 * Reads through the service role so an admin sees every investor, not only
 * their own row. The route guard is therefore the only thing standing between
 * a signed-in investor and everyone's data — hence notFound() rather than a
 * rendered "forbidden" page: a non-admin should not learn this URL exists.
 */
export default async function AdminLinksPage() {
  // users.view, not "is an admin". This page lists investors and their broker
  // account numbers, which is their data — a finance admin has no business in
  // it, and "any admin" is not a permission.
  if (!(await requirePermission("users.view"))) notFound();

  const t = await getTranslations("adminLinks");
  const service = createServiceClient();

  // Claims with a login but no confirmation yet — the actual work queue.
  const { data: rows } = await service
    .from("investors")
    .select("id, user_id, vantage_account_id, status, created_at, updated_at")
    .not("vantage_account_id", "is", null)
    .is("linked_at", null)
    .order("updated_at", { ascending: true });

  const claims = rows ?? [];

  return (
    <div>
      {/* No visible page title — see the note on the overview page. The h1
          stays screen-reader-only so the document still has a landmark. */}
      <h1 className="sr-only">{t("title")}</h1>

      {claims.length === 0 ? (
        <p className="mt-10 text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-3 pr-4 font-medium">
                  {t("table.investor")}
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  {t("table.login")}
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  {t("table.claimedAt")}
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  {t("table.status")}
                </th>
                <th scope="col" className="py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td className="py-4 pr-4 font-mono text-xs text-fg-muted">
                    {claim.user_id}
                  </td>
                  <td className="py-4 pr-4 font-mono tabular-nums">
                    {claim.vantage_account_id}
                  </td>
                  <td className="py-4 pr-4 text-fg-muted">
                    {new Date(claim.updated_at).toLocaleDateString("en-GB")}
                  </td>
                  <td className="py-4 pr-4 text-fg-muted">{claim.status}</td>
                  <td className="py-4">
                    <LinkActions investorId={claim.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
