"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import {
  deleteUser,
  disableUser,
  enableUser,
  updateUser,
} from "@/app/(app)/app/admin/(panel)/users/actions";
import { useToast } from "@/components/toast";
import { Card } from "@/components/ui";
import { inputClass } from "@/components/auth/auth-card";

/** A5 — the editable fields, and only those. */
export function EditUser({
  investorId,
  email,
  vantageAccountId,
  canEdit,
}: {
  investorId: string;
  email: string;
  vantageAccountId: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("adminUsers");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [nextEmail, setNextEmail] = useState(email);
  const [nextLogin, setNextLogin] = useState(vantageAccountId ?? "");

  if (!canEdit) return null;

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start(async () => {
      const res = await updateUser(investorId, {
        // Only send what changed, so an untouched field cannot fail
        // validation it was never going to be asked about.
        email: nextEmail !== email ? nextEmail : undefined,
        vantageAccountId:
          nextLogin !== (vantageAccountId ?? "") ? nextLogin || null : undefined,
      });

      if (res.ok) {
        toast.success(t("edit.saved"));
        router.refresh();
      } else {
        toast.error(t(`errors.${res.error}`));
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("edit.title")}</h2>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            {t("edit.email")}
          </label>
          <input
            id="email"
            type="email"
            value={nextEmail}
            onChange={(e) => setNextEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="login" className="block text-sm font-medium">
            {t("edit.broker")}
          </label>
          <input
            id="login"
            inputMode="numeric"
            value={nextLogin}
            onChange={(e) => setNextLogin(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1.5 text-xs text-fg-muted">{t("edit.brokerHint")}</p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] hover:bg-accent-hot disabled:opacity-60"
        >
          {pending ? t("edit.saving") : t("edit.save")}
        </button>
      </form>
    </Card>
  );
}

/** A6 — disable and re-enable. */
export function DisableUser({
  investorId,
  disabled,
  canDisable,
}: {
  investorId: string;
  disabled: boolean;
  canDisable: boolean;
}) {
  const t = useTranslations("adminUsers");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");

  if (!canDisable) return null;

  if (disabled) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">{t("disable.title")}</h2>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await enableUser(investorId);
              if (res.ok) {
                toast.success(t("disable.enabled"));
                router.refresh();
              } else toast.error(t(`errors.${res.error}`));
            })
          }
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-fg-muted disabled:opacity-60"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {t("disable.enable")}
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("disable.title")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        {t("disable.body")}
      </p>

      <label htmlFor="reason" className="mt-4 block text-sm font-medium">
        {t("disable.reason")}
      </label>
      <input
        id="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("disable.reasonPlaceholder")}
        className={inputClass}
      />

      <button
        type="button"
        // Required in the UI and again on the server. The reason is the only
        // record of why somebody lost access.
        disabled={pending || !reason.trim()}
        onClick={() =>
          start(async () => {
            const res = await disableUser(investorId, reason);
            if (res.ok) {
              toast.success(t("disable.done"));
              router.refresh();
            } else toast.error(t(`errors.${res.error}`));
          })
        }
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-chart-down/50 px-4 py-2.5 text-sm font-medium text-fg hover:border-chart-down disabled:opacity-60"
      >
        <Ban className="size-4" aria-hidden="true" />
        {t("disable.submit")}
      </button>
    </Card>
  );
}

/** A7 — delete. Super admin only, and the email must be typed. */
export function DeleteUser({
  investorId,
  email,
  canDelete,
}: {
  investorId: string;
  email: string;
  canDelete: boolean;
}) {
  const t = useTranslations("adminUsers");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [typed, setTyped] = useState("");

  if (!canDelete) {
    return (
      <Card className="border-border">
        <h2 className="text-lg font-semibold">{t("delete.title")}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t("delete.superOnly")}</p>
      </Card>
    );
  }

  return (
    <Card className="border-chart-down/40">
      <h2 className="text-lg font-semibold">{t("delete.title")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">
        {t("delete.body")}
      </p>

      <label htmlFor="confirm" className="mt-4 block text-sm font-medium">
        {t("delete.confirm", { email })}
      </label>
      <input
        id="confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        className={inputClass}
      />

      <button
        type="button"
        // Typed, not clicked. "Are you sure?" gets a reflex yes; an address has
        // to be read off the screen first.
        disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
        onClick={() =>
          start(async () => {
            const res = await deleteUser(investorId, typed);
            if (res.ok) {
              toast.success(t("delete.done"));
              router.push("/app/admin/users");
            } else toast.error(t(`errors.${res.error}`));
          })
        }
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-chart-down px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {t("delete.submit")}
      </button>
    </Card>
  );
}
