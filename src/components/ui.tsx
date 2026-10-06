import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  // Responsive to 390px (P2-101): px-5 keeps copy off the edge on a small phone.
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function Section({
  children,
  className = "",
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={`py-16 sm:py-24 ${className}`} {...props}>
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-accent">
      {/* A small lit dot: the cheapest way to make a label read as "live" */}
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"
      />
      {children}
    </p>
  );
}

/**
 * The accent fails contrast as body text, so it is only ever a background with
 * near-black on top, or a non-text highlight. See the accessibility rule in
 * globals.css.
 */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-all duration-200";

  const styles =
    variant === "primary"
      ? // The glow is what stops a flat yellow rectangle looking like a
        // placeholder. It grows on hover rather than appearing, so the button
        // reads as lit rather than as switching state.
        "bg-accent text-[#0A0A0A] shadow-[var(--glow-accent)] hover:bg-accent-hot hover:shadow-[0_10px_32px_-6px_rgb(255_176_32/0.6)] hover:-translate-y-px"
      : "surface border border-border text-fg hover:border-fg-muted hover:-translate-y-px";

  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  // `surface` gives the gradient fill, the lit top edge and the elevation —
  // one material, defined once, so no page invents its own.
  return (
    <div
      className={`surface rounded-xl border border-border p-6 ${className}`}
    >
      {children}
    </div>
  );
}
