import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    // `ambient` paints one soft accent bloom behind the panel. On a near-black
    // page a centred form with no light source reads as a wireframe.
    <div className="ambient relative flex min-h-full flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-block text-lg font-semibold tracking-tight"
        >
          Highzcore
        </Link>

        <div className="surface-raised mt-6 rounded-2xl border border-border p-7 sm:p-8">
          <h1 className="display text-2xl font-semibold">{title}</h1>
          {intro ? (
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              {intro}
            </p>
          ) : null}

          <div className="mt-7">{children}</div>
        </div>

        {footer ? (
          <div className="mt-6 text-center text-sm text-fg-muted">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

// `field-input` makes the control recede below the card it sits on and gives
// it an accent focus ring. A field the same colour as its container does not
// look typeable.
export const inputClass =
  "field-input mt-2 w-full rounded-lg px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-muted";

export const submitClass =
  "inline-flex w-full items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] shadow-[var(--glow-accent)] transition-all duration-200 hover:bg-accent-hot hover:shadow-[0_10px_32px_-6px_rgb(255_176_32/0.6)] disabled:opacity-60 disabled:shadow-none";

/**
 * Errors are announced, not just coloured. Someone using a screen reader
 * otherwise submits the form and hears nothing at all.
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-chart-down/40 bg-chart-down/10 px-3.5 py-2.5 text-sm text-fg"
    >
      {children}
    </p>
  );
}
