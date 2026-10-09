"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Mail, X } from "lucide-react";
import {
  inviteStaff,
  removeAdmin,
  revokeInvite,
  setAdminDisabled,
  setAdminRole,
} from "@/app/(app)/app/admin/(panel)/admins/actions";
import { useToast } from "@/components/toast";

export type RoleOption = {
  name: string;
  label: string;
  isSuper: boolean;
  permissions: string[];
};

export type AdminSummary = {
  userId: string;
  email: string;
  lastSignIn: string | null;
  role: string;
  disabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  loginCount: number;
};

export function AdminRow({
  admin,
  roles,
  canCreateSuper,
  isSelf,
}: {
  admin: AdminSummary;
  roles: RoleOption[];
  canCreateSuper: boolean;
  isSelf: boolean;
}) {
  const t = useTranslations("adminAdmins");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const role = roles.find((r) => r.name === admin.role);
  const isSuper = role?.isSuper ?? false;
  const selectable = roles.filter((r) => canCreateSuper || !r.isSuper);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(done);
        router.refresh();
      } else toast.error(t(`errors.${res.error}`));
    });
  }

  return (
    <tr className={admin.disabled ? "opacity-60" : undefined}>
      <th scope="row" className="py-3 pr-4 font-normal">
        <span className="block">{admin.email}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">
          {admin.lastSignIn
            ? t("lastSeen", {
                when: new Date(admin.lastSignIn).toLocaleDateString("en-GB"),
              })
            : t("neverSignedIn")}
        </span>
      </th>

      <td className="py-3 pr-4">
        {isSelf || (isSuper && !canCreateSuper) ? (
          <span>{role?.label ?? admin.role}</span>
        ) : (
          <select
            value={admin.role}
            disabled={pending}
            onChange={(e) =>
              run(() => setAdminRole(admin.userId, e.target.value), t("roleChanged"))
            }
            className="field-input rounded-md px-2 py-1.5 text-sm"
          >
            {selectable.map((r) => (
              <option key={r.name} value={r.name}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </td>

      <td className="py-3 pr-4 text-xs text-fg-muted">
        {admin.disabled
          ? t("state.disabled")
          : admin.mustChangePassword
            ? t("state.mustChange")
            : t("state.active")}
      </td>

      <td className="py-3 pr-4 text-xs text-fg-muted">
        {/* Login activity, from our own record rather than Supabase's
            last_sign_in_at: ours counts sign-ins, and cannot be reset by
            anything happening in the auth system. */}
        {admin.lastLoginAt ? (
          <>
            <span className="block">
              {new Date(admin.lastLoginAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="block">
              {t("logins", { count: admin.loginCount })}
            </span>
          </>
        ) : (
          t("neverSignedIn")
        )}
      </td>

      <td className="py-3">
        {isSelf ? (
          // Not a disabled button: there is nothing to enable. Saying why is
          // more use than a greyed-out control with no explanation.
          <span className="text-xs text-fg-muted">{t("thatsYou")}</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => setAdminDisabled(admin.userId, !admin.disabled),
                  admin.disabled ? t("enabled") : t("disabled"),
                )
              }
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              {admin.disabled ? t("enable") : t("disable")}
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => {
                // Confirmed because it is instant and silent from the other
                // person's side: they simply find the panel gone.
                if (!window.confirm(t("confirmRemove", { email: admin.email }))) {
                  return;
                }
                run(() => removeAdmin(admin.userId), t("removed"));
              }}
              className="rounded-md border border-chart-down/50 px-2.5 py-1.5 text-xs transition-colors hover:border-chart-down disabled:opacity-50"
            >
              {t("remove")}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}


/**
 * Invite a colleague who may not have an account at all.
 *
 * The primary way in now that staff no longer need a customer record. Nobody
 * becomes staff by signing up: the invitation names the role, expires in a
 * week, and is the only thing that creates the staff row.
 */
export function InviteStaffForm({
  roles,
  canCreateSuper,
}: {
  roles: RoleOption[];
  canCreateSuper: boolean;
}) {
  const t = useTranslations("adminAdmins");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(
    roles.find((r) => !r.isSuper)?.name ?? "support",
  );

  const selectable = roles.filter((r) => canCreateSuper || !r.isSuper);

  return (
    <form
      className="surface rounded-xl border border-accent/40 bg-accent/5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await inviteStaff(email, role);
          if (res.ok) {
            toast.success(t("invite.sent"));
            setEmail("");
            router.refresh();
          } else toast.error(t(`errors.${res.error}`));
        });
      }}
    >
      <p className="max-w-prose text-xs leading-relaxed text-fg-muted">
        {t("invite.note")}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex-1 basis-64 text-xs text-fg-muted">
          {t("invite.email")}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-input mt-1 w-full rounded-md px-3 py-2 text-sm"
          />
        </label>

        <label className="basis-44 text-xs text-fg-muted">
          {t("cols.role")}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="field-input mt-1 w-full rounded-md px-3 py-2 text-sm"
          >
            {selectable.map((r) => (
              <option key={r.name} value={r.name}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-50"
        >
          <Mail className="size-4" aria-hidden="true" />
          {pending ? t("invite.sending") : t("invite.submit")}
        </button>
      </div>
    </form>
  );
}

export function InviteRow({
  invite,
}: {
  invite: { id: string; email: string; role: string; expiresAt: string };
}) {
  const t = useTranslations("adminAdmins");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <tr>
      <th scope="row" className="py-3 pr-4 font-normal">
        {invite.email}
      </th>
      <td className="py-3 pr-4">{invite.role}</td>
      <td className="py-3 pr-4 text-xs text-fg-muted">
        {new Date(invite.expiresAt).toLocaleDateString("en-GB")}
      </td>
      <td className="py-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await revokeInvite(invite.id);
              if (res.ok) {
                toast.success(t("invite.revoked"));
                router.refresh();
              } else toast.error(t(`errors.${res.error}`));
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <X className="size-3.5" aria-hidden="true" />
          {t("invite.revoke")}
        </button>
      </td>
    </tr>
  );
}
