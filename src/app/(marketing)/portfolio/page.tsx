import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui";
import { PremiumCard } from "@/components/marketing/premium-card";
import { SectionHeading } from "@/components/marketing/section-heading";
import { listProjects } from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "Portfolio — what we have built",
  description:
    "Software, AI and mobile work we have shipped for clients, and the " +
    "products we run ourselves.",
};

export const dynamic = "force-dynamic";

/**
 * The public portfolio.
 *
 * THE PROOF THE AGENCY PAGE WAS MISSING. /build had one honest claim and
 * nothing behind it; ten written-up projects were sitting in the database
 * with nothing linking to them. This is the page that was missing, not the
 * data.
 *
 * READ THROUGH RLS, so this shows exactly what a visitor is allowed to see.
 * A draft is invisible here because the POLICY hides it, not because this
 * page filters — which means a mistake in this file cannot leak one.
 */
export default async function PortfolioPage() {
  const projects = await listProjects();

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
              Portfolio
            </p>
            <h1 className="display text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-5xl md:text-6xl">
              What we have built.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
              Client work and our own products. Each one is written up — the
              problem, what we built, and what happened afterwards.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          {projects.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Nothing published yet.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {projects.map((project) => (
                <PremiumCard
                  key={project.id}
                  href={`/portfolio/${project.slug}`}
                  className="h-full"
                >
                  <article className="flex h-full flex-col">
                    {project.coverImageUrl ? (
                      // Fixed aspect so a grid of mixed screenshots lines up.
                      // Unoptimised: these are served from highscore's public
                      // bucket, and routing them through our optimiser would
                      // make our deploy a dependency of their images loading.
                      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-[15px] bg-bg">
                        <Image
                          src={project.coverImageUrl}
                          alt=""
                          fill
                          unoptimized
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover"
                        />
                      </div>
                    ) : null}

                    <div className="flex flex-1 flex-col p-5 md:p-6">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                        {project.category ? (
                          <span className="rounded border border-border px-1.5 py-0.5">
                            {project.category}
                          </span>
                        ) : null}
                        {project.year ? <span>{project.year}</span> : null}
                      </div>

                      <h2 className="mt-3 text-base font-semibold md:text-lg">
                        {project.title}
                      </h2>
                      {/* The client, when there is one. Our own products have
                          none, and "internal" is a real answer rather than a
                          gap. */}
                      <p className="mt-0.5 text-xs text-accent">
                        {project.client ?? "Our own product"}
                      </p>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-muted">
                        {project.summary}
                      </p>

                      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs text-accent">
                        Read the case study
                        <ArrowRight className="size-3" aria-hidden="true" />
                      </span>
                    </div>
                  </article>
                </PremiumCard>
              ))}
            </div>
          )}
        </Container>
      </section>

      <section className="border-t border-border py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Start something"
            title="We build software for businesses."
            description="Tell us what you need built. We will say whether we are the right people."
          />
          <Link
            href="/build"
            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
          >
            About the agency
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Container>
      </section>
    </>
  );
}
