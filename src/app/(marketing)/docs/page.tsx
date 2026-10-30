import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Container } from "@/components/ui";
import { bySection, listPosts } from "@/lib/posts";
import { productBySlug } from "@/lib/products";

export const metadata: Metadata = {
  title: "Documentation — Highzcore",
  description:
    "How the products work — the trading platform, the analysis, and the " +
    "staff system. For customers and for staff.",
  alternates: { canonical: "/docs" },
};

export const dynamic = "force-dynamic";

/**
 * docs.highzcore.tech.
 *
 * BUILT TO LOOK RIGHT EMPTY, like the blog — there are no pages yet and the
 * empty state is the one that has to hold today.
 *
 * GROUPED, NOT A FEED, and that is the one place documentation genuinely
 * differs from a blog. Nobody reads docs newest-first; they look for the
 * thing they need, so the pages sit under headings in an order somebody
 * chose. A blog's newest post is the point; a doc's order is the point.
 *
 * NO CARDS HERE EITHER. A grid of boxes is right for a portfolio, where the
 * picture is the argument. Documentation is a list of titles somebody is
 * scanning, and rows scan faster than tiles.
 */
export default async function DocsPage() {
  const docs = await listPosts("doc");
  const product = productBySlug("docs");
  const groups = bySection(docs);

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
              Documentation
            </p>
            <h1 className="display text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-5xl md:text-6xl">
              {product?.what ?? "How to use what we have built."}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
              <span className="text-fg">For </span>
              {product?.who ?? "customers using the products, and staff running them."}
            </p>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          {docs.length === 0 ? (
            <div className="mx-auto max-w-[640px] py-10 text-center">
              <BookOpen
                className="mx-auto size-10 text-fg-subtle"
                aria-hidden="true"
              />
              <h2 className="display mt-5 text-2xl font-bold">
                The documentation is being written.
              </h2>
              <p className="mt-3 leading-relaxed text-fg-muted">
                Every page here will describe the product as it actually is,
                which means writing it against the real thing rather than
                against a specification. Until then, ask us — we would rather
                answer than point at a page that is wrong.
              </p>
              <Link
                href="/contact?from=docs"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
              >
                Ask us
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-12">
              {[...groups.entries()].map(([section, pages]) => (
                <section key={section}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    {section}
                  </h2>
                  <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
                    {pages.map((page) => (
                      <li key={page.id}>
                        <Link
                          href={`/docs/${page.slug}`}
                          className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium transition-colors group-hover:text-accent">
                              {page.title}
                              {!page.published ? (
                                <span className="ml-2 rounded border border-accent/40 px-1.5 py-0.5 text-[10px] text-accent">
                                  Draft
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                              {page.excerpt}
                            </p>
                          </div>
                          <ArrowRight
                            className="mt-1 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
