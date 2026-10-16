import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getAdmin, PERMISSIONS } from "@/lib/admin";
import { PERMISSION_LABELS } from "@/lib/permissions";
import { EditProfileButton } from "@/components/admin/profile-form";
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
      .select(
        "created_at, accepted_at, last_login_at, login_count, invited_by, full_name, job_title, phone, gender, city, state, country, notes",
      )
      .eq("user_id", admin.userId)
      .maybeSingle(),
    service
      .from("admin_logins")
      .select("signed_in_at")
      .eq("user_id", admin.userId)
      .order("signed_in_at", { ascending: false })
      .limit(10),
  ]);

  // "Super admin" rather than "super_admin (super admin)".
  const roleLabel = admin.isSuper
    ? "Super admin"
    : admin.role.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

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

      {/* WHO I AM, and a way to change it. Victor: "I should be able to view
          my own name and information and also be able to edit them."
          The page knew his role and his sign-in count and not his name. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">
            {row?.full_name ?? admin.email ?? "Signed in"}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {[row?.job_title, roleLabel].filter(Boolean).join(" · ")}
          </p>
        </div>
        <EditProfileButton
          label="Edit my profile"
          initial={{
            fullName: row?.full_name ?? "",
            jobTitle: row?.job_title ?? "",
            phone: row?.phone ?? "",
            gender: row?.gender ?? "",
            city: row?.city ?? "",
            state: row?.state ?? "",
            country: row?.country ?? "",
            notes: row?.notes ?? "",
          }}
        />
      </div>

      <section className="surface rounded-xl border border-border p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" value={admin.email ?? "—"} />
          {/* The label, not the database key. "super_admin (super admin)" said
              the same thing twice, once in snake case. */}
          <Field label="Role" value={roleLabel} />
          <Field label="Full name" value={row?.full_name ?? "Not set"} />
          <Field label="Job title" value={row?.job_title ?? "Not set"} />
          <Field label="Phone" value={row?.phone ?? "Not set"} />
          <Field label="Gender" value={row?.gender ?? "Not set"} />
          <Field
            label="Where"
            value={
              [row?.city, row?.state, row?.country].filter(Boolean).join(", ") ||
              "Not set"
            }
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
