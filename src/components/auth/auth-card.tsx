import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo, LogoLink } from "@/components/logo";

/**
 * The auth shell, shared by sign in, sign up, verify, forgot and reset.
 *
 * Two columns on a large screen. The left is the form and nothing else; the
 * right is the only thing on these pages that makes a case for going through
 * with it. An auth page with a bare form on an empty background asks for a
 * password while giving no reason to type one, which is the worst place in the
 * funnel to say nothing.
 *
 * Below `lg` the panel is dropped rather than stacked. On a phone it would
 * push the form under the fold, and the form is the whole point.
 */
export async function AuthCard({
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
  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-screen flex-1">
      {/* ---- Form column ---- */}
      <div className="relative flex w-full flex-col justify-center px-5 py-12 sm:px-8 lg:w-[52%] lg:px-16">
        {/* `ambient` is the same off-screen bloom the marketing pages use. It
            is what stops a centred form reading as a wireframe on near-black. */}
        <div
          aria-hidden="true"
          className="ambient pointer-events-none absolute inset-0 lg:hidden"
        />

        <div className="relative mx-auto w-full max-w-md">
          <div className="flex items-center justify-between gap-4">
            <LogoLink width={140} priority />
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft
                className="size-3.5 transition-transform group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
              {t("backToSite")}
            </Link>
          </div>

          <div className="mt-12">
            <h1 className="display text-3xl font-semibold sm:text-4xl">
              {title}
            </h1>
            {intro ? (
              <p className="mt-4 leading-relaxed text-fg-muted">{intro}</p>
            ) : null}
          </div>

          {/* The form sits on a raised panel rather than directly on the page.
              It gives the fields an edge to belong to, which is most of the
              difference between "a form" and "a product". */}
          <div className="surface-raised mt-8 rounded-2xl border border-border p-6 sm:p-8">
            {children}
          </div>

          {footer ? (
            <div className="mt-8 text-sm text-fg-muted">{footer}</div>
          ) : null}
        </div>
      </div>

      {/* ---- Brand panel ---- */}
      <aside className="relative hidden overflow-hidden border-l border-border bg-surface/30 lg:flex lg:w-[48%] lg:flex-col lg:justify-center lg:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-[32rem] rounded-full bg-accent/[0.07] blur-[120px]"
        />
        {/* A faint grid. It reads as a chart surface without drawing one, and
            the mask stops it ending in a hard line at the edges. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(70%_60%_at_50%_40%,black,transparent)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="relative max-w-lg">
          <Logo width={150} />

          <p className="display mt-10 text-3xl font-semibold leading-tight">
            {t("panel.title")}
          </p>
          <p className="mt-5 text-lg leading-relaxed text-fg-muted">
            {t("panel.body")}
          </p>

          <ul className="mt-10 space-y-4">
            {(t.raw("panel.points") as string[]).map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                  <Check className="size-3" aria-hidden="true" />
                </span>
                <span className="leading-relaxed text-fg-muted">{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-12 flex items-baseline gap-3 border-t border-border pt-8">
            <span className="display text-4xl font-semibold text-accent">
              {t("panel.stat.value")}
            </span>
            <span className="text-sm text-fg-muted">
              {t("panel.stat.label")}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
