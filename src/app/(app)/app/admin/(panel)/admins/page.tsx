import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdmin, requirePermission } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  AdminRow,
  InviteRow,
  InviteStaffForm,
} from "@/components/admin/admin-controls";
import type { AdminInvitation } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Admins", robots: { index: false } };
export const dynamic = "force-dynamic";

/** A2 — who can get in, and what each of them can do. */
export default async function AdminsPage() {
  if (!(await requirePermission("admins.manage"))) notFound();

  const t = await getTranslations("adminAdmins");
  const me = await getAdmin();
  const service = createServiceClient();

  const [{ data: rows }, { data: roles }, { data: inviteRows }] =
    await Promise.all([
      service
        .from("app_admins")
        .select(
          "user_id, role, disabled_at, must_change_password, created_at, last_login_at, login_count, accepted_at",
        )
        .order("created_at", { ascending: true }),
      service.from("admin_roles").select("name, label, permissions, is_super"),
      // Outstanding invitations only. Accepted ones are in the staff list
      // below, and revoked ones are not waiting on anybody.
      service
        .from("admin_invitations")
        .select("*")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
    ]);

  const invitations = (inviteRows ?? []) as AdminInvitation[];

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
        lastLoginAt: row.last_login_at,
        loginCount: row.login_count ?? 0,
      };
    }),
  );

  // Least powerful first, super admin last.
  //
  // The table returns them in insertion order, which put Super admin at the
  // top of every dropdown — the most dangerous role sitting exactly where a
  // mis-click lands, and the one that cannot then be disabled or deleted. The
  // ordering is the guard rail: you have to travel to reach it.
  const roleOptions = (roles ?? [])
    .map((r) => ({
      name: r.name as string,
      label: r.label as string,
      isSuper: Boolean(r.is_super),
      permissions: (r.permissions ?? []) as string[],
    }))
    .sort((a, b) => {
      if (a.isSuper !== b.isSuper) return a.isSuper ? 1 : -1;
      return a.permissions.length - b.permissions.length;
    });

  return (
    <div>
      <h1 className="display text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        {t("intro")}
      </p>

      {/* INVITE FIRST. Staff no longer need a customer account, so an
          invitation can reach somebody who has never signed up — which is what
          inviting a colleague actually looks like. Promoting an existing
          account is kept below for the case where they are already here. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("invite.title")}</h2>
        <div className="mt-4">
          <InviteStaffForm
            roles={roleOptions}
            canCreateSuper={me?.isSuper ?? false}
          />
        </div>
      </section>

      {invitations.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t("pending.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            {t("pending.intro")}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.person")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.role")}</th>
                  <th scope="col" className="py-2 pr-4 font-medium">{t("cols.expires")}</th>
                  <th scope="col" className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invitations.map((invite) => (
                  <InviteRow
                    key={invite.id}
                    invite={{
                      id: invite.id,
                      email: invite.email,
                      role:
                        roleOptions.find((r) => r.name === invite.role)?.label ??
                        invite.role,
                      expiresAt: invite.expires_at,
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("list.title")}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                <th scope="col" className="py-2 pr-4 font-medium">{t("cols.person")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("cols.role")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("cols.state")}</th>
                <th scope="col" className="py-2 pr-4 font-medium">{t("cols.activity")}</th>
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
