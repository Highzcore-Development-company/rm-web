import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui";
import { getProject } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) return {};
  return {
    title: `${project.title} — Highzcore`,
    description: project.summary,
    openGraph: {
      title: project.title,
      description: project.summary,
      images: project.coverImageUrl ? [project.coverImageUrl] : undefined,
    },
  };
}

/**
 * One case study.
 *
 * A DRAFT 404s HERE WITHOUT THIS FILE DECIDING SO. getProject reads through
 * RLS, so an unpublished project simply is not returned to a visitor — and
 * IS returned to somebody holding portfolio.manage, which is how they
 * preview before publishing. The same URL, two answers, decided by the
 * database.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();

  return (
    <article className="py-12 sm:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All work
          </Link>

          {/* Said plainly, and only to the people who can see it. A visitor
              never reaches this page for a draft, so anyone reading this
              line is previewing their own unpublished work. */}
          {!project.published ? (
            <p className="mt-4 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs text-accent">
              Draft — not visible to anyone else until you publish it.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
            {project.category ? (
              <span className="rounded border border-border px-1.5 py-0.5">
                {project.category}
              </span>
            ) : null}
            {project.year ? <span>{project.year}</span> : null}
          </div>

          <h1 className="display mt-3 text-3xl font-extrabold leading-[1.06] tracking-[-0.03em] sm:text-4xl md:text-5xl">
            {project.title}
          </h1>
          <p className="mt-2 text-sm text-accent">
            {project.client ?? "Our own product"}
          </p>
          <p className="mt-5 text-base leading-relaxed text-fg-muted sm:text-lg">
            {project.summary}
          </p>

          {project.techStack.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-1.5">
              {project.techStack.map((tech) => (
                <li
                  key={tech}
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted"
                >
                  {tech}
                </li>
              ))}
            </ul>
          ) : null}

          {project.externalUrl ? (
            <a
              href={project.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-7 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
            >
              See it live
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          ) : null}
        </div>

        {project.images.length > 0 ? (
          <div className="mx-auto mt-12 max-w-5xl space-y-4">
            {project.images.map((src, i) => (
              <div
                key={src}
                className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-border bg-bg"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  unoptimized
                  // The first image is the one above the fold on a phone.
                  priority={i === 0}
                  sizes="(max-width: 1024px) 100vw, 64rem"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}

        {project.bodyMd ? (
          <div className="mx-auto mt-12 max-w-3xl">
            <CaseStudy markdown={project.bodyMd} />
          </div>
        ) : null}
      </Container>
    </article>
  );
}

/**
 * The case study body.
 *
 * A SMALL DELIBERATE MARKDOWN SUBSET rather than a library. These bodies use
 * headings, paragraphs, bullets and bold — that is all any of the ten
 * contains — and rendering them by hand keeps this page free of a dependency
 * and free of dangerouslySetInnerHTML. The text is ours, but it arrives from
 * a database row somebody edits, and not putting raw HTML on the page is the
 * cheapest way for that never to matter.
 *
 * Anything it does not understand renders as plain text, which is a readable
 * failure rather than a broken one.
 */
function CaseStudy({ markdown }: { markdown: string }) {
  const blocks = markdown.trim().split(/\n{2,}/);

  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        const text = block.trim();

        if (text.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="display pt-4 text-xl font-bold tracking-[-0.02em] sm:text-2xl"
            >
              {text.slice(3)}
            </h2>
          );
        }
        if (text.startsWith("### ")) {
          return (
            <h3 key={i} className="pt-2 text-base font-semibold">
              {text.slice(4)}
            </h3>
          );
        }
        if (/^[-*] /m.test(text)) {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {text.split("\n").map((line, j) => (
                <li
                  key={j}
                  className="flex gap-2 text-sm leading-relaxed text-fg-muted"
                >
                  <span className="text-accent" aria-hidden="true">
                    ·
                  </span>
                  <span>{inline(line.replace(/^[-*] /, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-fg-muted sm:text-base">
            {inline(text)}
          </p>
        );
      })}
    </div>
  );
}

/** **bold** only — the one inline mark these bodies actually use. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-fg">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
