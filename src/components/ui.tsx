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
    <p className="text-sm font-medium uppercase tracking-widest text-accent">
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
    "inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-semibold transition-colors";
  const styles =
    variant === "primary"
      ? "bg-accent text-[#0A0A0A] hover:bg-accent-hot"
      : "border border-border text-fg hover:border-fg-muted";

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
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-6 ${className}`}
    >
      {children}
    </div>
  );
}
