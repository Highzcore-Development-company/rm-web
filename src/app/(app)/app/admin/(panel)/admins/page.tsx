import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdmin, requirePermission } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { AddAdminForm, AdminRow } from "@/components/admin/admin-controls";

export const metadata: Metadata = { title: "Admins", robots: { index: false } };
export const dynamic = "force-dynamic";

/** A2 — who can get in, and what each of them can do. */
export default async function AdminsPage() {
  if (!(await requirePermission("admins.manage"))) notFound();

  const t = await getTranslations("adminAdmins");
  const me = await getAdmin();
  const service = createServiceClient();

  const [{ data: rows }, { data: roles }] = await Promise.all([
    service
      .from("app_admins")
      .select("user_id, role, disabled_at, must_change_password, created_at")
      .order("created_at", { ascending: true }),
    service.from("admin_roles").select("name, label, permissions, is_super"),
  ]);

  // Emails live in auth.users, which PostgREST cannot join, so they are
  // fetched and matched here. Same approach as the user list.
  const admins = await Promise.all(
    (rows ?? []).map(async (row) => {
      const account = await service.auth.admin.getUserById(row.user_id);
      return {
        userId: row.user_id,
        email: account.data?.user?.email ?? "(unknown)",
        lastSignIn: account.data?.user?.last_sign_in_at ?? null,
        role: row.role,
        disabled: Boolean(row.disabled_at),
        mustChangePassword: row.must_change_password,
      };
    }),
  );

  const roleOptions = (roles ?? []).map((r) => ({
    name: r.name as string,
    label: r.label as string,
    isSuper: Boolean(r.is_super),
    permissions: (r.permissions ?? []) as string[],
  }));

  return (
    <div>
      <h1 className="display text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        {t("intro")}
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("add.title")}</h2>
        <div className="mt-4">
          <AddAdminForm roles={roleOptions} canCreateSuper={me?.isSuper ?? false} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("list.title")}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-2 pr-4 font-medium">{t("cols.person")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("cols.role")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("cols.state")}</th>
                <th scope="col" className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {admins.map((admin) => (
                <AdminRow
                  key={admin.userId}
                  admin={admin}
                  roles={roleOptions}
                  canCreateSuper={me?.isSuper ?? false}
                  // Your own row renders without controls. Demoting or
                  // removing yourself locks you out of the page that would
                  // undo it.
                  isSelf={admin.userId === me?.userId}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* What each role actually grants, on the page where roles are chosen.
          Picking one from a dropdown of names is guesswork otherwise. */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("roles.title")}</h2>
        <dl className="mt-4 space-y-4">
          {roleOptions.map((role) => (
            <div key={role.name}>
              <dt className="text-sm font-medium">{role.label}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-fg-muted">
                {role.isSuper
                  ? t("roles.superNote")
                  : role.permissions.length === 0
                    ? t("roles.none")
                    : role.permissions.join(" · ")}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
