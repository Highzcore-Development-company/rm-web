import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, PenLine } from "lucide-react";
import { Container } from "@/components/ui";
import { PremiumCard } from "@/components/marketing/premium-card";
import { listPosts } from "@/lib/posts";
import { productBySlug } from "@/lib/products";

export const metadata: Metadata = {
  title: "The blog — Highzcore",
  description:
    "What we are learning as we build and trade, written down as it happens.",
  alternates: { canonical: "/blog" },
};

export const dynamic = "force-dynamic";

/**
 * blog.highzcore.tech.
 *
 * BUILT TO LOOK RIGHT EMPTY. Esther: "but build a UI so if it comes it will
 * look good." There are no posts yet — that is Olivia's half of the brief —
 * so the state that has to hold today is the one with nothing in it, and the
 * state that has to hold next week is a grid.
 *
 * So the hero carries the page on its own, and the empty state says plainly
 * that nothing is published rather than rendering a headline over a void.
 * The moment a post is published the same page becomes a proper feed with no
 * further work.
 *
 * THE FIRST POST IS FEATURED, full width with its cover. A blog whose latest
 * piece looks identical to its twentieth is a list, and the point of a blog
 * is the newest thing on it.
 */
export default async function BlogPage() {
  const posts = await listPosts("blog");
  const product = productBySlug("blog");
  const [lead, ...rest] = posts;

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
              The blog
            </p>
            <h1 className="display text-4xl font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-5xl md:text-6xl">
              {product?.what ??
                "What we are learning as we build, written down as it happens."}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-fg-muted sm:text-lg">
              Written by the people doing the work — including the parts that
              did not go to plan.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
          {posts.length === 0 ? (
            <div className="mx-auto max-w-[640px] py-10 text-center">
              <PenLine
                className="mx-auto size-10 text-fg-subtle"
                aria-hidden="true"
              />
              <h2 className="display mt-5 text-2xl font-bold">
                The first posts are being written.
              </h2>
              <p className="mt-3 leading-relaxed text-fg-muted">
                We would rather publish something worth reading than fill this
                page. In the meantime, the products themselves are the clearest
                thing we have to show.
              </p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
              >
                See what we do
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              {/* The latest, given the room it deserves. */}
              <PremiumCard href={`/blog/${lead.slug}`} className="block">
                <article className="grid gap-0 md:grid-cols-2">
                  {lead.coverImageUrl ? (
                    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-[15px] bg-bg md:rounded-l-[15px] md:rounded-tr-none">
                      <Image
                        src={lead.coverImageUrl}
                        alt=""
                        fill
                        unoptimized
                        priority
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col justify-center p-6 md:p-8">
                    <p className="text-[11px] uppercase tracking-wider text-accent">
                      Latest
                    </p>
                    <h2 className="display mt-2 text-2xl font-bold leading-tight tracking-[-0.02em] sm:text-3xl">
                      {lead.title}
                    </h2>
                    <p className="mt-3 leading-relaxed text-fg-muted">
                      {lead.excerpt}
                    </p>
                    <Byline post={lead} className="mt-4" />
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                      Read it
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </article>
              </PremiumCard>

              {rest.length > 0 ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                  {rest.map((post) => (
                    <PremiumCard
                      key={post.id}
                      href={`/blog/${post.slug}`}
                      className="h-full"
                    >
                      <article className="flex h-full flex-col">
                        {post.coverImageUrl ? (
                          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-[15px] bg-bg">
                            <Image
                              src={post.coverImageUrl}
                              alt=""
                              fill
                              unoptimized
                              sizes="(max-width: 768px) 100vw, 33vw"
                              className="object-cover"
                            />
                          </div>
                        ) : null}
                        <div className="flex flex-1 flex-col p-5 md:p-6">
                          <h3 className="text-base font-semibold leading-tight md:text-lg">
                            {post.title}
                          </h3>
                          <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">
                            {post.excerpt}
                          </p>
                          <Byline post={post} className="mt-4" />
                        </div>
                      </article>
                    </PremiumCard>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Container>
      </section>
    </>
  );
}

/**
 * Who wrote it and when.
 *
 * The date is formatted from the ISO string with a FIXED locale and UTC, not
 * the reader's. toLocaleDateString() with no arguments gives a different
 * answer on the server and in the browser, which React treats as a corrupted
 * tree rather than a cosmetic difference.
 */
function Byline({
  post,
  className = "",
}: {
  post: { author: string | null; publishedAt: string | null; published: boolean };
  className?: string;
}) {
  const bits = [
    post.author,
    post.publishedAt
      ? new Date(post.publishedAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : null,
  ].filter(Boolean);

  return (
    <p className={`text-xs text-fg-subtle ${className}`}>
      {!post.published ? (
        <span className="mr-2 rounded border border-accent/40 px-1.5 py-0.5 text-accent">
          Draft
        </span>
      ) : null}
      {bits.join(" · ")}
    </p>
  );
}
