"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { acceptWithPassword } from "@/app/(app)/app/admin/accept/actions";

/**
 * Set a password and accept the invitation, for a colleague with no account.
 *
 * The address is NOT a field. It comes from the invitation and is shown as
 * fixed text — taking it from the form would turn an invite for one colleague
 * into an account-creation endpoint for any address somebody typed.
 *
 * On success this does a full document navigation rather than a router push.
 * The session cookie was just written by the server action, and Next's client
 * router can answer the next page from an RSC payload fetched while there was
 * no session — landing them back on the login redirect they just came through.
 * Same reasoning as lib/sign-out.ts, in the other direction.
 */
export function SetPasswordForm({
  token,
  email,
  name,
  roleLabel,
}: {
  token: string;
  email: string;
  name: string | null;
  roleLabel: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 8 && confirm === password;

  return (
    <form
      className="mt-8"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        start(async () => {
          const result = await acceptWithPassword(token, password);
          if (result.ok) {
            window.location.replace("/app/admin");
          } else {
            setError(messageFor(result.error));
          }
        });
      }}
    >
      <div className="surface rounded-xl border border-border p-5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
          {name ? `${name} — ${roleLabel}` : roleLabel}
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Signing in as <span className="font-medium text-fg">{email}</span>
        </p>

        <label className="mt-5 block text-xs text-fg-muted">
          <span className="mb-1 block">Choose a password</span>
          <span className="relative block">
            <input
              type={show ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field-input w-full rounded-md px-3 py-2.5 pr-11 text-sm"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted transition-colors hover:text-fg"
            >
              {show ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </span>
          <span className="mt-1 block text-[11px]">
            {tooShort ? (
              <span className="text-accent">At least 8 characters.</span>
            ) : (
              <span className="text-fg-subtle">At least 8 characters.</span>
            )}
          </span>
        </label>

        <label className="mt-3 block text-xs text-fg-muted">
          <span className="mb-1 block">Type it again</span>
          <input
            type={show ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="field-input w-full rounded-md px-3 py-2.5 text-sm"
          />
          {mismatch ? (
            <span className="mt-1 block text-[11px] text-accent">
              These do not match.
            </span>
          ) : null}
        </label>

        {error ? (
          <p className="mt-4 rounded-lg border border-accent/40 bg-accent/5 px-3.5 py-2.5 text-xs leading-relaxed">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !ready}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-60"
        >
          {pending ? "Setting up…" : "Accept and sign in"}
        </button>
      </div>
    </form>
  );
}

/** Every refusal says what to do about it. */
function messageFor(code: string): string {
  switch (code) {
    case "invalid":
      return "This invitation is no longer valid. Ask whoever invited you to send a new one.";
    case "expired":
      return "This invitation has expired. Ask whoever invited you to send a new one.";
    case "weak":
      return "That password is too short — at least 8 characters.";
    case "account_exists":
      return "There is already an account for this address. Sign in with it instead and open the link again.";
    case "sign_in_failed":
      return "Your account is set up, but signing you in failed. Go to the login page and sign in with the password you just chose.";
    default:
      return "Something went wrong setting up the account. Try again, and tell whoever invited you if it keeps failing.";
  }
}
