import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LinkActions } from "@/components/admin/link-actions";
import { Container } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
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
  if (!(await isAdmin())) notFound();

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
    <Container className="py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        {t("intro")}
      </p>

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
    </Container>
  );
}
