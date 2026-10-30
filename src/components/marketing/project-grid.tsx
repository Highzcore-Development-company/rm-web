import { ArrowRight } from "lucide-react";
import { PremiumCard } from "@/components/marketing/premium-card";
import { ProjectCardMedia } from "@/components/marketing/project-card-media";
import type { PortfolioProject } from "@/lib/portfolio";

/**
 * The portfolio grid — ported from highscore-tech-web's /portfolio.
 *
 * Esther: "whatever you see in this highscore tech web portfolio and studio
 * is what I want, the UI and the UX, except the colour." So this is their
 * card, line for line:
 *
 *   - media on top, hovering plays a silent preview if there is a video
 *   - title and YEAR on one baseline, year right-aligned and monospaced
 *   - the client in small caps under it
 *   - the summary filling the rest, so cards of different lengths still
 *     bottom-align
 *   - the first four tech pills, then "+2" rather than a wrapped mess
 *   - "Read case study" appearing ONLY on hover
 *
 * That last one is the detail worth keeping: a call to action on every card
 * at rest is six of them competing, and none of them means anything.
 *
 * Only the colour changes. Their `text-brand` is our `text-accent`, and
 * `bg-surface-hover` is `bg-surface`.
 */
export function ProjectGrid({ projects }: { projects: PortfolioProject[] }) {
  if (projects.length === 0) {
    return <p className="text-sm text-fg-muted">Nothing published yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
      {projects.map((p) => (
        <PremiumCard key={p.id} href={`/build/${p.slug}`} className="h-full">
          <div className="flex h-full flex-col">
            <ProjectCardMedia
              cover={p.coverImageUrl}
              category={p.category}
              title={p.title}
            />

            <div className="flex flex-1 flex-col p-5 md:p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-semibold leading-tight transition-colors group-hover:text-accent md:text-xl">
                  {p.title}
                </h3>
                {p.year ? (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-fg-subtle">
                    {p.year}
                  </span>
                ) : null}
              </div>

              {p.client ? (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  {p.client}
                </p>
              ) : null}

              <p className="mt-3 flex-1 text-sm leading-relaxed text-fg-muted">
                {p.summary}
              </p>

              {p.techStack.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.techStack.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="inline-flex h-6 items-center rounded-md bg-surface px-2 text-[11px] font-medium text-fg-muted"
                    >
                      {t}
                    </span>
                  ))}
                  {p.techStack.length > 4 ? (
                    <span className="inline-flex h-6 items-center px-2 text-[11px] text-fg-subtle">
                      +{p.techStack.length - 4}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Staff only — RLS keeps drafts away from a visitor entirely,
                  so anyone reading this is looking at their own unpublished
                  work. Not part of the original; the original has no drafts
                  to show. */}
              {!p.published ? (
                <span className="mt-3 inline-flex w-fit items-center rounded border border-accent/40 px-1.5 py-0.5 text-[11px] text-accent">
                  Draft
                </span>
              ) : null}

              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
                Read case study
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </PremiumCard>
      ))}
    </div>
  );
}
