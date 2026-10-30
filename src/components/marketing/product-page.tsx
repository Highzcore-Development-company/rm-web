import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Container } from "@/components/ui";
import { PremiumCard } from "@/components/marketing/premium-card";
import { SectionHeading } from "@/components/marketing/section-heading";
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
 * BUILT IN highscore-tech-web's IDIOM, in our colours — Esther, 29 Oct:
 * "use it for the others, just don't use its colour, maybe its design." So
 * the wide-tracked eyebrow, the large negatively-tracked display heading and
 * the lit card are theirs; `accent`, `fg` and `surface` are ours.
 *
 * ORDER IS THE BRIEF'S ORDER. What it is, who it is for, how to start, why
 * us — and the button sits above the proof, because somebody already
 * convinced should not have to scroll past the argument to act.
 */
export function ProductPage({ product }: { product: Product }) {
  const others = PRODUCTS.filter((p) => p.slug !== product.slug);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border py-20 sm:py-28">
        {/* Their ambient backdrop, as a clipped accent wash rather than the
            3D shader — the effect that matters at this size is the glow
            behind the heading, and a WebGL scene is a lot of weight for it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[44rem] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]"
        />

        <Container>
          <div className="relative max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {product.name}
            </p>

            {/* WHAT IT IS — one sentence, as the headline. The brief wants it
                "the moment the page loads", and nothing loads sooner. */}
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

      {/* WHY US — proof, and only proof we have. A product with nothing to
          point at renders nothing here rather than three padded paragraphs;
          see the note on Product.why. */}
      {product.why.length > 0 ? (
        <section className="border-b border-border py-16 sm:py-24">
          <Container>
            <SectionHeading eyebrow="Why us" title="Why you can believe it" />
            <div className="mt-8 grid gap-4 md:mt-12 md:grid-cols-2 lg:grid-cols-3 md:gap-6">
              {product.why.map((point) => (
                <PremiumCard key={point.claim} className="h-full">
                  <div className="p-5 md:p-6">
                    <span className="inline-flex size-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                      <Check className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold md:text-lg">
                      {point.claim}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                      {point.detail}
                    </p>
                  </div>
                </PremiumCard>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {/* The index, from every page. The brief's rule is that the root
          explains all of them; a visitor who lands deep should still see the
          whole company without going back to the top. */}
      <section className="py-16 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow="Highzcore"
            title="The rest of what we do"
          />
          <div className="mt-8 grid gap-4 md:mt-12 md:grid-cols-2 lg:grid-cols-3 md:gap-6">
            {others.map((p) => (
              <PremiumCard key={p.slug} href={`/${p.slug}`} className="h-full">
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
