import Link from "next/link";
import { ArrowRight, Check, Clock } from "lucide-react";
import { formatNgn, type StudioPackage } from "@/lib/studio/catalog";

/**
 * One product on the Studio menu — ported from highscore-tech-web's
 * PackageCard.
 *
 * Esther: their UI and UX, not their colour. So everything that makes this
 * card sell is kept, including the two things easiest to mistake for
 * clutter, which their own note calls out:
 *
 *   marketValue — what the same work costs bought separately. The business
 *   tiers only look expensive until you notice the website is inside them.
 *
 *   monthlyAfterNgn — what the ongoing work costs once the included months
 *   run out. Said BEFORE they buy, never after: a client who reads it here
 *   does not feel ambushed in month two.
 *
 * WHAT CHANGED. `text-brand` is `text-accent`, `bg-brand` is `bg-accent`,
 * `text-success` is `text-chart-up`, `border-border-strong` and
 * `bg-surface-hover` collapse to tokens we have. Their bullets come from a
 * second module (`includeTitles`, `detailFor`) that pulls full deliverable
 * copy for the order flow — we have no order flow, so the card uses
 * `pkg.includes` directly, which is the same list one level less detailed.
 *
 * THE BUTTON GOES TO CONTACT, NOT TO A CHECKOUT. Theirs opens /studio/order,
 * an AlatPay flow with a brief form behind it. Porting a "Start your order"
 * button to a page that does not exist would be worse than the honest one.
 */
export function PackageCard({
  pkg,
  className = "",
}: {
  pkg: StudioPackage;
  className?: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-surface p-6 transition-colors ${
        pkg.featured
          ? "border-accent/50 shadow-[0_0_0_1px_var(--accent)]"
          : "border-border hover:border-fg-subtle"
      } ${className}`}
    >
      {pkg.featured ? (
        <span className="absolute -top-2.5 left-6 inline-flex h-5 items-center rounded-full bg-accent px-2.5 text-[10px] font-bold uppercase tracking-wider text-[#0A0A0A]">
          Most popular
        </span>
      ) : null}

      <h3 className="text-lg font-bold">{pkg.name}</h3>

      <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
        {pkg.from ? (
          <span className="text-sm font-semibold text-fg-subtle">from</span>
        ) : null}
        <span className="display text-3xl font-extrabold tabular-nums text-accent">
          {formatNgn(pkg.priceNgn)}
        </span>
      </p>

      {/* The comparison that makes the price stop being a question. */}
      {pkg.marketValue ? (
        <p className="mt-1.5 text-xs text-fg-subtle">{pkg.marketValue}</p>
      ) : null}

      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{pkg.blurb}</p>

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-subtle">
        <Clock className="size-3.5" aria-hidden="true" />
        {pkg.turnaroundDays} working days
      </p>

      <ul className="mt-5 flex-1 space-y-2.5">
        {pkg.includes.map((line) => (
          <li
            key={line}
            className="flex gap-2.5 text-sm leading-relaxed text-fg-muted"
          >
            <Check
              className="mt-0.5 size-4 shrink-0 text-chart-up"
              aria-hidden="true"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {/* Said before they buy, never after. */}
      {pkg.monthlyAfterNgn ? (
        <p className="mt-5 rounded-lg border border-border bg-bg px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
          Continues at{" "}
          <span className="font-semibold text-fg">
            {formatNgn(pkg.monthlyAfterNgn)}
          </span>{" "}
          a month {pkg.monthlyAfterNote ?? "afterwards"}.
        </p>
      ) : null}

      {pkg.note ? (
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{pkg.note}</p>
      ) : null}

      <Link
        href={`/contact?from=studio&package=${encodeURIComponent(pkg.key)}`}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
      >
        Talk to us
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
