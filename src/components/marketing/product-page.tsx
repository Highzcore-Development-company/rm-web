import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui";
import { HeroBackdrop } from "@/components/hero-backdrop";
import { PremiumCard } from "@/components/marketing/premium-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { PRODUCTS, type Product } from "@/lib/products";
import { productUrl } from "@/lib/subdomain";

/**
 * A product landing page.
 *
 * Esther: "make a better UI for Scora and doc and blog — something like
 * autotrade, it looks well." It does, and the difference was never the
 * colour: /autotrade is the animated backdrop, a headline that arrives, a
 * section that says what the thing DOES, a numbered how-it-works and a
 * closing call to action. These three had a headline, a sentence and a
 * button — four questions answered correctly and a page nobody would read
 * twice.
 *
 * So this now carries the same furniture:
 *
 *   hero       HeroBackdrop behind it — the same four drifting layers the
 *              trading hero uses, reused rather than imitated
 *   features   what it actually does. SEPARATE from "why us": that is
 *              proof, this is capability, and a page with only proof is a
 *              page of adjectives.
 *   how        numbered steps, when the product has them
 *   why us     the proof, as before
 *   the rest   the other products, at their own doors
 *
 * STILL THE BRIEF'S FOUR QUESTIONS. What it is and who it is for in the
 * hero, how to start in the button, why us below — none of that moved. What
 * was added is the middle, which is where somebody decides.
 *
 * Sections render only when the data is there, so a product with no steps
 * does not get an empty band with a heading over it.
 */
export async function ProductPage({ product }: { product: Product }) {
  const others = PRODUCTS.filter((p) => p.slug !== product.slug);
  // Links to OTHER products go to their own doors; see productUrl.
  const host = (await headers()).get("host");

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-border py-24 sm:py-32">
        <HeroBackdrop />

        <Container>
          <div className="relative max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {product.name}
            </p>

            {/* WHAT IT IS — one sentence, as the headline. */}
            <h1 className="display text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-5xl md:text-6xl">
              {product.what}
            </h1>

            {/* WHO IT IS FOR — directly under it, because the first thing a
                visitor does is work out whether this is aimed at them. */}
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
              <span className="text-fg">For </span>
              {product.who}
            </p>

            {/* HOW TO START — one button, as the brief asks. */}
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href={product.start.href}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
              >
                {product.start.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              {product.start.note ? (
                <p className="max-w-sm text-xs leading-relaxed text-fg-muted">
                  {product.start.note}
                </p>
              ) : null}
            </div>
          </div>
        </Container>
      </section>

      {/* ── What it does ─────────────────────────────────────────── */}
      {product.features?.length ? (
        <section className="border-b border-border py-16 sm:py-24">
          <Container>
            <SectionHeading
              eyebrow="What it does"
              title={`Everything ${product.name} gives you.`}
            />
            <div className="mt-8 grid gap-4 md:mt-12 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {product.features.map((f) => (
                <PremiumCard key={f.title} className="h-full">
                  <div className="p-5 md:p-6">
                    <h3 className="text-base font-semibold md:text-lg">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                      {f.body}
                    </p>
                  </div>
                </PremiumCard>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {/* ── How it works ─────────────────────────────────────────── */}
      {product.steps?.length ? (
        <section className="border-b border-border py-16 sm:py-24">
          <Container>
            <SectionHeading eyebrow="How it works" title="Three steps." />
            <ol className="mt-8 grid gap-6 md:mt-12 md:grid-cols-3">
              {product.steps.map((s, i) => (
                <li key={s.title} className="relative">
                  {/* The number large and dim behind the text — the same
                      device the trading page's Steps section uses, so the
                      two read as one site. */}
                  <span
                    aria-hidden="true"
                    className="display block text-5xl font-extrabold leading-none text-accent/20"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </Container>
        </section>
      ) : null}

      {/* ── Why us ───────────────────────────────────────────────── */}
      {product.why.length > 0 ? (
        <section className="border-b border-border py-16 sm:py-24">
          <Container>
            <SectionHeading eyebrow="Why us" title="Why you can believe it" />
            <ul className="mt-8 grid gap-6 md:mt-12 md:grid-cols-2 lg:grid-cols-3">
              {product.why.map((point) => (
                <li key={point.claim}>
                  <p className="flex items-start gap-2 font-medium">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    {point.claim}
                  </p>
                  <p className="mt-2 pl-6 text-sm leading-relaxed text-fg-muted">
                    {point.detail}
                  </p>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* ── Closing ──────────────────────────────────────────────── */}
      <section className="border-b border-border py-16 sm:py-24">
        <Container>
          <div className="rounded-2xl border border-accent/30 bg-accent/[0.04] p-6 text-center sm:p-10">
            <h2 className="display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
              {product.start.label}.
            </h2>
            {product.start.note ? (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fg-muted">
                {product.start.note}
              </p>
            ) : null}
            <Link
              href={product.start.href}
              className="mt-7 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
            >
              {product.start.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </Container>
      </section>

      {/* ── The rest of the company ──────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <Container>
          <SectionHeading eyebrow="Highzcore" title="The rest of what we do" />
          <div className="mt-8 grid gap-4 md:mt-12 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {others.map((p) => (
              <PremiumCard
                key={p.slug}
                href={productUrl(p.slug, host)}
                className="h-full"
              >
                <div className="p-5 md:p-6">
                  <h3 className="text-base font-semibold md:text-lg">{p.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                    {p.tagline}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs text-accent">
                    Open
                    <ArrowRight className="size-3" aria-hidden="true" />
                  </span>
                </div>
              </PremiumCard>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
