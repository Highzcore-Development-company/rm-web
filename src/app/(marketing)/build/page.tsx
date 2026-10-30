import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { Container } from "@/components/ui";
import { SectionHeading } from "@/components/marketing/section-heading";
import { ProjectGrid } from "@/components/marketing/project-grid";
import { listProjects } from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "Highscore Build — selected work",
  description:
    "Selected client work and internal builds — AI systems, web platforms " +
    "and mobile applications shipped by Highscore.",
  alternates: { canonical: "/build" },
};

export const dynamic = "force-dynamic";

/**
 * build.highzcore.tech — the software agency.
 *
 * THIS IS highscore-tech-web's /portfolio PAGE, reproduced. Esther: "whatever
 * you see in this highscore tech web portfolio and studio is what I want —
 * the UI and the UX, except the colour", and "/portfolio shouldn't be a
 * separate route at all, only /build". So the work is the agency's front
 * door rather than a page behind it, and this is their layout:
 *
 *   hero          eyebrow, "Selected work.", a paragraph, then category
 *                 pills with a count on "All"
 *   grid          their card — see project-grid
 *   empty state   an icon, "Case studies coming soon", and a way to talk to
 *                 us. Kept, because an empty portfolio with nothing to do
 *                 next is worse than no portfolio.
 *   CTA           "Want to be the next case study?"
 *
 * What changed: `text-brand` to `text-accent`, `bg-brand-tint` to
 * `bg-accent/10`, and their Reveal wrapper — a scroll-driven fade with a 3D
 * ambient backdrop — is a plain section here. The motion is theirs to keep;
 * the WebGL layer behind it is a lot of weight for a wash.
 *
 * The case studies live at /build/[slug].
 */
export default async function BuildPage() {
  const projects = await listProjects();
  const categories = [
    ...new Set(projects.map((p) => p.category).filter(Boolean)),
  ] as string[];

  return (
    <>
      <section className="relative px-4 pb-12 pt-24 md:px-8 md:pb-20 md:pt-36">
        <div className="mx-auto max-w-[920px] space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Portfolio
          </p>
          <h1 className="display text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl md:text-7xl">
            Selected work.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-fg-muted md:text-xl">
            A working showcase of the products we have shipped — for clients
            and for ourselves. New case studies land as projects complete.
          </p>

          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-4">
              <span className="inline-flex h-8 items-center rounded-full bg-accent/10 px-3 text-xs font-semibold uppercase tracking-wider text-accent">
                All ({projects.length})
              </span>
              {categories.map((c) => (
                <span
                  key={c}
                  className="inline-flex h-8 items-center rounded-full border border-border bg-surface/60 px-3 text-xs font-medium text-fg-muted backdrop-blur"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="px-4 py-12 md:px-8 md:py-20">
        <div className="mx-auto max-w-[1180px]">
          {projects.length === 0 ? (
            <div className="mx-auto max-w-[640px] py-16 text-center">
              <Layers className="mx-auto size-10 text-fg-subtle" aria-hidden="true" />
              <h2 className="display mt-5 text-2xl font-bold">
                Case studies coming soon.
              </h2>
              <p className="mt-3 leading-relaxed text-fg-muted">
                We are polishing the first round of public case studies. In the
                meantime, talk to us about your project and we will share
                relevant examples directly.
              </p>
              <Link
                href="/contact?from=build"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
              >
                Get in touch
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <ProjectGrid projects={projects} />
          )}
        </div>
      </section>

      {projects.length > 0 ? (
        <section className="px-4 py-20 md:px-8 md:py-28">
          <Container>
            <div className="mx-auto max-w-[820px] text-center">
              <SectionHeading
                align="center"
                title="Want to be the next case study?"
                description="Tell us about your project. If we are a fit, we will come back with a scope and a timeline."
              />
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/contact?from=build"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
                >
                  Start a project
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center text-sm font-semibold text-fg-muted transition-colors hover:text-fg"
                >
                  See what else we do →
                </Link>
              </div>
            </div>
          </Container>
        </section>
      ) : null}
    </>
  );
}
