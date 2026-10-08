/**
 * Form primitives shared by every auth form.
 *
 * SEPARATE FROM auth-card.tsx ON PURPOSE. AuthCard became an async server
 * component when it gained the brand panel, which made it import
 * `next-intl/server`. Ten client components import Field / FormError /
 * inputClass / submitClass, and importing them from that same module dragged
 * server-only code into the client bundle.
 *
 * The symptom was a page that server-rendered perfectly and then went blank:
 * the HTML contained the whole form, and the browser threw it away when the
 * client bundle failed to evaluate.
 *
 * Nothing here may import from next-intl/server, next/headers, or anything
 * else that only exists on the server. If a primitive needs translating, the
 * caller passes the string in.
 */

import type { ReactNode } from "react";

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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-fg-muted transition-colors"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-2 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Inputs recede and panels advance — `--input-bg` is darker than the surface
 * it sits on, so a field reads as a well rather than another card.
 *
 * The focus ring is the accent at low alpha rather than the browser default.
 * It has to be obvious: this is the only signal a keyboard user gets about
 * where they are in the form.
 */
export const inputClass =
  "mt-2 w-full rounded-lg border border-border bg-[var(--input-bg)] px-3.5 py-3 text-sm text-fg outline-none transition-all duration-200 placeholder:text-fg-muted hover:border-fg-muted/50 focus:border-accent focus:shadow-[var(--ring-accent)]";

export const submitClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3.5 text-sm font-semibold text-[#0A0A0A] shadow-[var(--glow-accent)] transition-all duration-200 hover:bg-accent-hot hover:shadow-[0_10px_32px_-6px_rgb(255_176_32/0.6)] focus-visible:outline-none focus-visible:shadow-[var(--ring-accent)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:bg-accent";

/**
 * Errors are announced, not just coloured. Someone using a screen reader
 * otherwise submits the form and hears nothing at all.
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-chart-down/40 bg-chart-down/10 px-3.5 py-3 text-sm text-fg"
    >
      <span
        aria-hidden="true"
        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-chart-down"
      />
      <span className="leading-relaxed">{children}</span>
    </p>
  );
}
