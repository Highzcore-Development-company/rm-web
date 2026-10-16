import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getAdmin, PERMISSIONS } from "@/lib/admin";
import { PERMISSION_LABELS } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = { title: "My profile", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The signed-in admin's own account.
 *
 * EVERY PERMISSION IS LISTED, held or not. A list of only what you hold
 * answers "what can I do" but not "why can't I do that" — which is the
 * question somebody actually arrives with, and the one that otherwise costs
 * Victor a message.
 *
 * The permissions shown are read through the same getAdmin() the guards use,
 * so this page cannot claim an access the server would refuse.
 */
export default async function AdminProfilePage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  // Login history for this admin only. Service role, because app_admins is
  // readable by the admin themselves but admin_logins is written by it.
  const service = createServiceClient();
  const [{ data: row }, { data: logins }] = await Promise.all([
    service
      .from("app_admins")
      .select("created_at, accepted_at, last_login_at, login_count, invited_by")
      .eq("user_id", admin.userId)
      .maybeSingle(),
    service
      .from("admin_logins")
      .select("signed_in_at")
      .eq("user_id", admin.userId)
      .order("signed_in_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="max-w-3xl">
      {/* NO VISIBLE PAGE TITLE. Victor, 16 Oct: "remove all title from each
          pages, I don't like it... Keep it without any title." The sidebar
          already says which page this is, so the heading and its blurb were
          repeating it back.

          The h1 stays, screen-reader-only: a document with no h1 gives an
          assistive reader no landmark to jump to and no idea what it has
          landed on, and "invisible" is not the same as "absent". */}
      <h1 className="sr-only">My profile</h1>

      <section className="surface rounded-xl border border-border p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" value={admin.email ?? "—"} />
          <Field
            label="Role"
            value={admin.isSuper ? `${admin.role} (super admin)` : admin.role}
          />
          <Field
            label="Admin since"
            value={
              row?.accepted_at
                ? new Date(row.accepted_at).toLocaleDateString("en-GB")
                : row?.created_at
                  ? new Date(row.created_at).toLocaleDateString("en-GB")
                  : "—"
            }
          />
          <Field
            label="Sign-ins"
            value={row?.login_count ? String(row.login_count) : "—"}
          />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
          Permissions
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          {admin.isSuper
            ? "You are a super admin, so you hold every permission — including any added later."
            : "Set by your role. Only an admin with admins.manage can change it."}
        </p>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((permission) => {
            const held = admin.permissions.includes(permission);
            return (
              <li
                key={permission}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  held
                    ? "border-border"
                    : "border-border/60 text-fg-subtle"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                    held ? "bg-chart-up" : "bg-fg-subtle/40"
                  }`}
                />
                {/* The action, with the key beside it: this page answers
                    "why can't I do that", and the dotted name is what somebody
                    would quote when asking for it. */}
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {PERMISSION_LABELS[permission].label}
                  </span>
                  <span className="block font-mono text-[10px] text-fg-subtle">
                    {permission}
                  </span>
                </span>
                <span className="shrink-0 self-start text-[11px]">
                  {held ? "yes" : "no"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Recent sign-ins</h2>
        {/* One row per actual sign-in, not per page load — the log is keyed on
            the auth system's last_sign_in_at. See recordAdminLogin. */}
        {!logins?.length ? (
          <p className="mt-3 text-sm text-fg-muted">
            Nothing recorded yet. This log started when staff accounts did.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {logins.map((login) => (
              <li
                key={login.signed_in_at as string}
                className="px-4 py-2.5 text-sm tabular-nums text-fg-muted"
              >
                {new Date(login.signed_in_at as string).toLocaleString("en-GB")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Password</h2>
        <Link
          href="/app/admin/change-password"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
        >
          <KeyRound className="size-4" aria-hidden="true" />
          Change my password
        </Link>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
