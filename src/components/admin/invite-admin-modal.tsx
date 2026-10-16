"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail, UserPlus, X } from "lucide-react";
import { useToast } from "@/stores";
import {
  inviteStaff,
  type StaffProfile,
} from "@/app/(app)/app/admin/(panel)/admins/actions";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * Invite an admin — a button, and a form in a dialog.
 *
 * Victor: "So it will be when I click a button to create an admin that a form
 * modal will show, after filling the form I will click to invite the person,
 * then he will accept and set up his password from the email received."
 *
 * It was an email box and a role dropdown sitting permanently at the top of
 * the page, above the list of admins. Two problems with growing it in place:
 * nine fields in a panel that is always open pushes the thing people came to
 * read off the screen, and a form you cannot close is one you cannot abandon
 * halfway.
 *
 * EVERY FIELD BUT THE EMAIL IS OPTIONAL, and the form says so. An invitation
 * that could not be sent because nobody knew a colleague's state would be
 * worked around within a week, and a half-known profile beats none.
 *
 * The permissions here ADD to the role; they never subtract. A role that
 * cannot be trusted to mean what it says is a role to change rather than one
 * to carve exceptions out of per person, so the checkboxes already granted by
 * the chosen role are shown ticked and disabled — you can see what the role
 * gives before deciding whether anything is missing.
 */

export type RoleOption = {
  name: string;
  label: string;
  isSuper: boolean;
  permissions: string[];
};

export function InviteAdminButton({
  roles,
  canCreateSuper,
}: {
  roles: RoleOption[];
  canCreateSuper: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
      >
        <UserPlus className="size-4" aria-hidden="true" />
        Create an admin
      </button>

      {open ? (
        <InviteDialog
          roles={roles}
          canCreateSuper={canCreateSuper}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function InviteDialog({
  roles,
  canCreateSuper,
  onClose,
}: {
  roles: RoleOption[];
  canCreateSuper: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("adminAdmins");
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const firstField = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<StaffProfile>({});
  // The LEAST powerful role, because `roles` arrives ordered that way. Least
  // privilege by default: handing someone more than they need should take a
  // deliberate choice, not an unchanged dropdown.
  const [role, setRole] = useState(
    roles.find((r) => !r.isSuper)?.name ?? "support",
  );
  const [extra, setExtra] = useState<string[]>([]);

  // Only a super admin may create another. Otherwise anyone holding
  // admins.manage could mint an account that outranks them and that nobody can
  // then disable or delete.
  const selectable = roles.filter((r) => canCreateSuper || !r.isSuper);
  const chosen = roles.find((r) => r.name === role);
  const fromRole = new Set(
    chosen?.isSuper ? PERMISSIONS : (chosen?.permissions ?? []),
  );

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while a dialog is over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, pending]);

  function set<K extends keyof StaffProfile>(key: K, value: StaffProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  function submit() {
    start(async () => {
      const result = await inviteStaff(email, role, {
        ...profile,
        // Only the ones the role does not already give. Sending the rest would
        // bake today's role definition into the person, so a later change to
        // the role would not reach them.
        extraPermissions: extra.filter((p) => !fromRole.has(p)),
      });

      if (result.ok) {
        toast.success(t("invite.sent"));
        router.refresh();
        onClose();
      } else {
        toast.error(t(`errors.${result.error}`));
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
        aria-labelledby="invite-title"
        className="surface-raised relative z-10 w-full max-w-2xl rounded-xl border border-border shadow-elev-2"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="invite-title" className="text-base font-semibold">
              Create an admin
            </h2>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-fg-muted">
              They are emailed a link. They set their own password when they
              accept it — we never see it. The link lasts 7 days and only works
              for the address it was sent to.
            </p>
          </div>
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
            <Field label="Email address" required className="sm:col-span-2">
              <input
                ref={firstField}
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="colleague@highzcore.tech"
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Full name" className="sm:col-span-2">
              <input
                type="text"
                value={profile.fullName ?? ""}
                onChange={(event) => set("fullName", event.target.value)}
                placeholder="Esther Olukorede"
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Job title">
              <input
                type="text"
                value={profile.jobTitle ?? ""}
                onChange={(event) => set("jobTitle", event.target.value)}
                placeholder="Operations"
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Phone">
              <input
                type="tel"
                value={profile.phone ?? ""}
                onChange={(event) => set("phone", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>

            {/* Free text with suggestions rather than a fixed dropdown: a
                closed list of genders is a schema change the first time
                somebody does not fit it, and this field decides nothing. */}
            <Field label="Gender">
              <input
                type="text"
                list="admin-gender-options"
                value={profile.gender ?? ""}
                onChange={(event) => set("gender", event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
              <datalist id="admin-gender-options">
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
                value={profile.city ?? ""}
                onChange={(event) => set("city", event.target.value)}
                placeholder="Lagos"
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label="State">
              <input
                type="text"
                value={profile.state ?? ""}
                onChange={(event) => set("state", event.target.value)}
                placeholder="Lagos"
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Country" className="sm:col-span-2">
              <input
                type="text"
                value={profile.country ?? ""}
                onChange={(event) => set("country", event.target.value)}
                placeholder="Nigeria"
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
          </Section>

          <Section title="What they may do">
            <Field label="Role" className="sm:col-span-2">
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              >
                {selectable.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-fg-muted">
                {chosen?.isSuper
                  ? "Everything, including managing admins. Cannot be disabled or removed — step the role down first."
                  : fromRole.size === 0
                    ? "This role grants nothing on its own."
                    : [...fromRole].join(" · ")}
              </p>
            </Field>

            <div className="sm:col-span-2">
              <p className="text-xs text-fg-muted">
                Extra permissions{" "}
                <span className="opacity-70">
                  — on top of the role, never instead of it
                </span>
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {PERMISSIONS.map((permission) => {
                  const granted = fromRole.has(permission);
                  return (
                    <label
                      key={permission}
                      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                        granted
                          ? "border-border/60 text-fg-subtle"
                          : "border-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        // Already given by the role: shown ticked so the role
                        // is legible, and disabled because unticking it here
                        // would imply a subtract that does not exist.
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
                      <span className="font-mono">{permission}</span>
                      {granted ? (
                        <span className="ml-auto opacity-70">from role</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title="Anything else">
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                rows={2}
                value={profile.notes ?? ""}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Why they need access, who asked for it"
                className="field-input w-full rounded-md px-3 py-2 text-sm"
              />
            </Field>
          </Section>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <p className="mr-auto text-xs text-fg-subtle">
              Only the email is required.
            </p>
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
              disabled={pending || !email.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-60"
            >
              <Mail className="size-4" aria-hidden="true" />
              {pending ? "Sending…" : "Send invitation"}
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
  required = false,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-xs text-fg-muted ${className}`}>
      <span className="mb-1 block">
        {label}
        {required ? <span className="ml-0.5 text-accent">*</span> : null}
      </span>
      {children}
    </label>
  );
}
