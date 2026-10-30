import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Container, Eyebrow } from "@/components/ui";
import { PRODUCTS, type Product } from "@/lib/products";

/**
 * A product landing page — HS-WEB-v1, page three.
 *
 * ONE COMPONENT FOR ALL OF THEM, and that is the point rather than a
 * convenience. The brief sets a completion test: four questions answered the
 * moment the page loads, and "if any one of them is missing, the page is not
 * finished". Six hand-written pages would each be one edit away from losing
 * one; here the four are the component's structure, so a page cannot quietly
 * ship without them.
 *
 * ORDER IS THE BRIEF'S ORDER. What it is, who it is for, how to start, why
 * us — a visitor reads top to bottom and the button is above the proof,
 * because somebody already convinced should not have to scroll past the
 * argument to act.
 */
export function ProductPage({ product }: { product: Product }) {
  const others = PRODUCTS.filter((p) => p.slug !== product.slug);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border py-16 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <Eyebrow>{product.name}</Eyebrow>

            {/* WHAT IT IS — in one sentence, as the headline. The brief asks
                for it "the moment the page loads", and nothing loads sooner
                than the first line. */}
            <h1 className="display mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
              {product.what}
            </h1>

            {/* WHO IT IS FOR — named plainly, directly under it, because the
                first thing a visitor does is work out whether this is aimed
                at them. */}
            <p className="mt-5 text-base leading-relaxed text-fg-muted">
              <span className="text-fg">For </span>
              {product.who}
            </p>

            {/* HOW TO START — one button, as the brief asks. */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href={product.start.href}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
              >
                {product.start.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              {product.start.note ? (
                <p className="text-xs text-fg-muted">{product.start.note}</p>
              ) : null}
            </div>
          </div>
        </Container>
      </section>

      {/* WHY US — proof, and only proof we have. A product with nothing to
          point at renders nothing here rather than three padded paragraphs;
          see the note on Product.why. */}
      {product.why.length > 0 ? (
        <section className="border-b border-border py-16 sm:py-20">
          <Container>
            <h2 className="text-xs uppercase tracking-wide text-fg-muted">
              Why us
            </h2>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* The index, from every page. The brief's rule is that the root
          explains all of them; a visitor who lands deep should still be able
          to see the whole company without going back to the top. */}
      <section className="py-16 sm:py-20">
        <Container>
          <h2 className="text-xs uppercase tracking-wide text-fg-muted">
            The rest of Highzcore
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {others.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/${p.slug}`}
                  className="group block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 text-sm text-fg-muted">{p.tagline}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs text-accent">
                    Open
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
    </>
  );
}
