"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { useToast } from "@/stores";
import {
  updateAdminProfile,
  updateMyProfile,
  type ProfileFields,
} from "@/app/(app)/app/admin/(panel)/profile/actions";
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions";

/**
 * View and edit an admin's profile.
 *
 * Victor: "I should be able to view my own name and information and also be
 * able to edit them as the super admin. I should also do same for other
 * admins."
 *
 * ONE COMPONENT, TWO TRUST LEVELS, and the difference is in what it renders
 * rather than only in what the server accepts:
 *
 *   editing YOURSELF   name, title, phone, gender, city, state, country,
 *                      notes. No permissions. A self-service form that could
 *                      raise its own access is a privilege escalation with a
 *                      nice layout, and it would not take an attacker — just
 *                      a mis-click on a page every admin can reach.
 *   editing SOMEBODY   the same, plus the permissions their role does not
 *                      already give. Behind admins.manage, checked on the
 *                      server; this only decides whether to draw the section.
 *
 * The server enforces both independently — `updateMyProfile` writes the
 * session's own row and cannot be pointed at another, and the permissions
 * argument is simply absent from it. Hiding a control is not a permission.
 */

export type ProfileValues = ProfileFields & {
  extraPermissions?: string[];
};

export function EditProfileButton({
  /** Null edits the signed-in admin; a user id edits that admin. */
  userId = null,
  label = "Edit",
  rolePermissions,
  initial,
}: {
  userId?: string | null;
  label?: string;
  /** What the role already grants — shown ticked and disabled. */
  rolePermissions?: string[];
  initial: ProfileValues;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        {label}
      </button>

      {open ? (
        <ProfileDialog
          userId={userId}
          rolePermissions={rolePermissions}
          initial={initial}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ProfileDialog({
  userId,
  rolePermissions,
  initial,
  onClose,
}: {
  userId: string | null;
  rolePermissions?: string[];
  initial: ProfileValues;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);

  const [fields, setFields] = useState<ProfileFields>({
    fullName: initial.fullName ?? "",
    jobTitle: initial.jobTitle ?? "",
    phone: initial.phone ?? "",
    gender: initial.gender ?? "",
    city: initial.city ?? "",
    state: initial.state ?? "",
    country: initial.country ?? "",
    notes: initial.notes ?? "",
  });
  const [extra, setExtra] = useState<string[]>(initial.extraPermissions ?? []);

  // Permissions are only editable for somebody else. See the note above.
  const canEditPermissions = userId !== null && rolePermissions !== undefined;
  const fromRole = new Set(rolePermissions ?? []);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, pending]);

  function set<K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    start(async () => {
      const result = userId
        ? await updateAdminProfile(
            userId,
            fields,
            // Only what the role does not already give. Sending the rest would
            // bake today's role into the person, so a later change to the role
            // would not reach them.
            canEditPermissions
              ? extra.filter((p) => !fromRole.has(p))
              : undefined,
          )
        : await updateMyProfile(fields);

      if (result.ok) {
        toast.success("Saved.");
        router.refresh();
        onClose();
      } else {
        toast.error(
          result.error === "forbidden"
            ? "You do not have permission to change that."
            : "Could not save. Try again.",
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !pending && onClose()}
        className="fixed inset-0 cursor-default bg-black/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="surface-raised relative z-10 w-full max-w-2xl rounded-xl border border-border shadow-elev-2"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <h2 id="profile-title" className="text-base font-semibold">
            {userId ? "Edit this admin" : "Edit my profile"}
          </h2>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label="Close"
            className="shrink-0 text-fg-muted transition-colors hover:text-fg"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <form
          className="max-h-[70vh] overflow-y-auto px-5 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Section title="Who they are">
            <Field label="Full name" className="sm:col-span-2">
              <input
                ref={firstField}
                type="text"
                value={fields.fullName ?? ""}
                onChange={(event) => set("fullName", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Job title">
              <input
                type="text"
                value={fields.jobTitle ?? ""}
                onChange={(event) => set("jobTitle", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={fields.phone ?? ""}
                onChange={(event) => set("phone", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Gender">
              <input
                type="text"
                list="profile-gender-options"
                value={fields.gender ?? ""}
                onChange={(event) => set("gender", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
              <datalist id="profile-gender-options">
                <option value="Female" />
                <option value="Male" />
                <option value="Prefer not to say" />
              </datalist>
            </Field>
          </Section>

          <Section title="Where they are">
            <Field label="City">
              <input
                type="text"
                value={fields.city ?? ""}
                onChange={(event) => set("city", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label="State">
              <input
                type="text"
                value={fields.state ?? ""}
                onChange={(event) => set("state", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Country" className="sm:col-span-2">
              <input
                type="text"
                value={fields.country ?? ""}
                onChange={(event) => set("country", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
          </Section>

          {canEditPermissions ? (
            <Section title="Extra permissions">
              <div className="sm:col-span-2">
                <p className="text-xs text-fg-muted">
                  On top of their role, never instead of it. Change the role to
                  change what it grants.
                </p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {PERMISSIONS.map((permission) => {
                    const granted = fromRole.has(permission);
                    return (
                      <label
                        key={permission}
                        className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${
                          granted
                            ? "border-border/60 text-fg-subtle"
                            : "border-border"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0"
                          checked={granted || extra.includes(permission)}
                          disabled={granted}
                          onChange={(event) =>
                            setExtra((list) =>
                              event.target.checked
                                ? [...list, permission]
                                : list.filter((p) => p !== permission),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
                            {PERMISSION_LABELS[permission].label}
                          </span>
                          <span className="block text-[11px] text-fg-subtle">
                            {PERMISSION_LABELS[permission].hint}
                          </span>
                        </span>
                        {granted ? (
                          <span className="shrink-0 self-start opacity-70">
                            from role
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            </Section>
          ) : null}

          <Section title="Anything else">
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                rows={2}
                value={fields.notes ?? ""}
                onChange={(event) => set("notes", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
          </Section>

          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-xs uppercase tracking-wide text-fg-muted">{title}</h3>
      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-xs text-fg-muted ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
