import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { SectionHeading } from "@/components/marketing/section-heading";
import { StudioReel } from "@/components/marketing/studio-reel";
import { listStudioWorks } from "@/lib/studio";
import { productBySlug } from "@/lib/products";

export const metadata: Metadata = {
  title: "Highscore Studio — media and content",
  description:
    "Adverts, jingles and brand films. Work for BOLT, MTN, Chevron Comedy " +
    "Club, AOR Autos and Laughter Cave.",
};

export const dynamic = "force-dynamic";

/**
 * studio.highzcore.tech.
 *
 * A STATIC ROUTE, overriding the shared /[product] page, because the studio's
 * proof is the work itself. Reading "media and content for brands that need
 * to be seen" is not persuasive; watching the MTN spot is.
 *
 * The four questions HS-WEB-v1 requires are still answered — what it is and
 * who it is for in the headline, how to start in the button, and WHY US is
 * the reel rather than three bullet points.
 */
export default async function StudioPage() {
  const works = await listStudioWorks();
  const product = productBySlug("studio");

  // The clients, from the work itself rather than a list somebody maintains
  // separately — a logo wall that can go stale is worse than none.
  const clients = [...new Set(works.map((w) => w.client).filter(Boolean))];

  return (
    <>
      <section className="relative overflow-hidden border-b border-border py-20 sm:py-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[44rem] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]"
        />
        <Container>
          <div className="relative max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Highscore Studio
            </p>
            <h1 className="display text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-5xl md:text-6xl">
              {product?.what ??
                "We make the content a brand is known by."}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
              <span className="text-fg">For </span>
              {product?.who ??
                "brands doing good work that nobody has heard about yet."}
            </p>

            {clients.length > 0 ? (
              <p className="mt-7 text-sm text-fg-subtle">
                {clients.join(" · ")}
              </p>
            ) : null}

            <Link
              href="/contact?from=studio"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
            >
              Book a call
            </Link>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          <SectionHeading
            eyebrow="The work"
            title="Watch it."
            description="Adverts, jingles and brand films we have made."
          />
          <div className="mt-8 md:mt-12">
            <StudioReel works={works} />
          </div>
        </Container>
      </section>
    </>
  );
}
