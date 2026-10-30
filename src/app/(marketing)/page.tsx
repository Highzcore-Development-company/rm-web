import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Container, Eyebrow } from "@/components/ui";
import { PRODUCTS } from "@/lib/products";

export const metadata: Metadata = {
  title: "Highzcore — one company, one domain",
  alternates: { canonical: "/" },
  description:
    "The AI trading bot, the analysis, the software agency and the studio — " +
    "everything Highzcore does, on one page.",
};

/**
 * HS-WEB-v1 — the main page.
 *
 * "One scroll. It names all the products, one line each, links into each
 * subdomain, and carries the investor call to action. It is the first thing
 * an investor sees, so it has to read like a company that knows exactly what
 * it is."
 *
 * THE ROOT, because the subdomains are live. What used to be here was
 * Scora's sales page — its own note said "the homepage sells Scora" — so it
 * moved to /analysis, which is the door it belongs behind. It was not
 * rewritten: a page that converts did not need rebuilding, it needed the
 * right address.
 *
 * ONE LINE EACH, from lib/products, so this page cannot describe a product
 * as something its own page no longer says.
 */
export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border py-20 sm:py-28">
        {/* The same device the existing sections use — a wide, soft accent
            behind the heading. Clipped by the section, so it cannot widen
            the page on a phone. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[46rem] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]"
        />
        <Container>
          <div className="relative max-w-3xl">
            <Eyebrow>Highscore Tech · Lagos</Eyebrow>
            <h1 className="display mt-4 text-4xl font-semibold leading-[1.1] sm:text-5xl">
              One company, four things we are good at.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted">
              We build and run software. Two of our products trade and read the
              markets; the other half of the company builds software and makes
              content for other businesses. Everything below is ours, running,
              and you can open any of it from here.
            </p>
          </div>
        </Container>
      </section>

      {/* THE INDEX. Every product, one line each, linking into its own page —
          the brief's rule for the whole site. */}
      <section className="border-b border-border py-16 sm:py-20">
        <Container>
          <h2 className="text-xs uppercase tracking-wide text-fg-muted">
            What we do
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {PRODUCTS.map((product) => (
              <li key={product.slug}>
                <Link
                  href={`/${product.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40"
                >
                  <p className="font-medium">{product.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                    {product.tagline}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-fg-subtle">
                    {product.who}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs text-accent">
                    Open {product.name}
                    <ArrowRight
                      className="size-3 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* THE INVESTOR CALL TO ACTION. The brief names this as the one thing
          the main page carries beyond the index, and says who the page is
          for — so it is a section, not a line in the footer. */}
      <section className="py-16 sm:py-24">
        <Container>
          <div className="rounded-2xl border border-accent/30 bg-accent/[0.04] p-6 sm:p-10">
            <div className="max-w-2xl">
              <Eyebrow>For investors</Eyebrow>
              <h2 className="display mt-4 text-2xl font-semibold sm:text-3xl">
                We are raising, and the products are already running.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-fg-muted">
                The trading bot trades a live account daily and every trade is
                recorded. The analysis product answers on the same live market
                data. We would rather show you the system working than talk
                about a roadmap.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link
                  href="/investors"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
                >
                  Talk to us
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/performance"
                  className="text-sm text-fg-muted underline underline-offset-4 transition-colors hover:text-fg"
                >
                  See how the bot has traded
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
