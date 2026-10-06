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
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-16 sm:py-24">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Highzcore
      </Link>

      <h1 className="mt-10 text-2xl font-semibold tracking-tight">{title}</h1>
      {intro ? (
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{intro}</p>
      ) : null}

      <div className="mt-8">{children}</div>

      {footer ? (
        <div className="mt-8 text-sm text-fg-muted">{footer}</div>
      ) : null}
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

export const inputClass =
  "mt-2 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg placeholder:text-fg-muted";

export const submitClass =
  "inline-flex w-full items-center justify-center rounded-md bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-60";

/**
 * Errors are announced, not just coloured. Someone using a screen reader
 * otherwise submits the form and hears nothing at all.
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-chart-down/40 bg-chart-down/10 px-3 py-2 text-sm text-fg"
    >
      {children}
    </p>
  );
}
