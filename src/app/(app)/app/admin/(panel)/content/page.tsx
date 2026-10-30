import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ContentEditor,
  type AdminPost,
} from "@/components/admin/content-editor";

export const metadata: Metadata = { title: "Content", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The blog and the documentation, for the person writing them.
 *
 * Esther: "we have to add blogs and doc on admin so she can add to it."
 * HS-WEB-v1 gives Olivia the content — "nobody explains what we do better
 * than the person who checks it works" — and both pages described themselves
 * and led to nothing.
 *
 * READ WITH THE ORDINARY CLIENT so RLS decides. Holding portfolio.manage is
 * what returns the drafts; without it this page would show a writer exactly
 * what a visitor sees, which is the one view that is no use to them.
 */
export default async function AdminContentPage() {
  if (!(await requirePermission("portfolio.manage"))) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    // Docs are read in their chosen order; posts newest first. One query,
    // sorted for both — the editor splits them by kind.
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: true });

  const posts: AdminPost[] = (data ?? []).map((p) => ({
    id: p.id as string,
    kind: p.kind as "blog" | "doc",
    slug: p.slug as string,
    title: p.title as string,
    excerpt: p.excerpt as string,
    bodyMd: p.body_md as string | null,
    coverImageUrl: p.cover_image_url as string | null,
    section: p.section as string | null,
    author: p.author as string | null,
    sortOrder: (p.sort_order as number | null) ?? 0,
    published: p.published as boolean,
    publishedAt: p.published_at as string | null,
  }));

  return (
    <div className="max-w-4xl">
      <h1 className="sr-only">Content</h1>

      <p className="max-w-prose text-xs leading-relaxed text-fg-muted">
        What we publish. Anything you write starts as a draft — preview it,
        then publish when it is ready. Publishing is a separate button on
        purpose.
      </p>

      <div className="mt-6">
        <ContentEditor posts={posts} />
      </div>
    </div>
  );
}
