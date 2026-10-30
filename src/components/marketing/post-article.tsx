import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui";
import { PostBody } from "@/components/marketing/post-body";
import type { Post } from "@/lib/posts";

/**
 * One post, or one documentation page.
 *
 * SHARED, because a blog post and a doc page are the same thing rendered —
 * a title, a byline, a cover and a body. Only the way back differs, and that
 * is a prop. Two near-identical files would drift the first time somebody
 * improved one of them.
 *
 * HELD TO A READING MEASURE. max-w-3xl is about 70 characters a line, which
 * is where prose stops being work to read. The cover is allowed wider,
 * because an image is not read line by line.
 */
export function PostArticle({ post }: { post: Post }) {
  const backTo = post.kind === "blog" ? "/blog" : "/docs";
  const backLabel = post.kind === "blog" ? "All posts" : "All documentation";

  return (
    <article className="py-12 sm:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          <Link
            href={backTo}
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {backLabel}
          </Link>

          {/* Only ever seen by somebody who may manage this — RLS keeps a
              draft away from a visitor entirely. So it carries the way back
              to the admin, for the same reason the portfolio preview does:
              this opens in a new tab and the browser has no history to go
              back to. */}
          {!post.published ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5">
              <p className="text-xs leading-relaxed text-accent">
                <strong className="font-semibold">Preview.</strong> This is a
                draft — nobody else can open this page until you publish it.
              </p>
              <Link
                href="/app/admin/content"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back to Content
              </Link>
            </div>
          ) : null}

          {post.section ? (
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {post.section}
            </p>
          ) : null}

          <h1 className="display mt-3 text-3xl font-extrabold leading-[1.06] tracking-[-0.03em] sm:text-4xl md:text-5xl">
            {post.title}
          </h1>

          <p className="mt-5 text-base leading-relaxed text-fg-muted sm:text-lg">
            {post.excerpt}
          </p>

          {post.author || post.publishedAt ? (
            <p className="mt-4 text-xs text-fg-subtle">
              {[
                post.author,
                post.publishedAt
                  ? // Fixed locale and UTC: toLocaleDateString() with no
                    // arguments answers differently on the server and in the
                    // browser, and React treats that as a corrupted tree.
                    new Date(post.publishedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>

        {post.coverImageUrl ? (
          <div className="mx-auto mt-10 max-w-5xl">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-bg">
              <Image
                src={post.coverImageUrl}
                alt=""
                fill
                unoptimized
                priority
                sizes="(max-width: 1024px) 100vw, 64rem"
                className="object-cover"
              />
            </div>
          </div>
        ) : null}

        {post.bodyMd ? (
          <div className="mx-auto mt-10 max-w-3xl">
            <PostBody markdown={post.bodyMd} />
          </div>
        ) : null}
      </Container>
    </article>
  );
}
