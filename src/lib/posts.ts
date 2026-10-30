import { createClient } from "@/lib/supabase/server";

/**
 * Blog posts and documentation pages.
 *
 * ONE TABLE, TWO DOORS — see the migration. `kind` decides which subdomain
 * serves a row; everything else about them is the same.
 *
 * Read with the ordinary client so RLS decides. A draft is invisible to a
 * visitor because the POLICY hides it, and visible to somebody holding
 * portfolio.manage so they can preview before publishing. Same arrangement
 * as the portfolio, for the same reason.
 */

export type PostKind = "blog" | "doc";

export type Post = {
  id: string;
  kind: PostKind;
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string | null;
  coverImageUrl: string | null;
  section: string | null;
  author: string | null;
  sortOrder: number;
  published: boolean;
  publishedAt: string | null;
};

type Row = {
  id: string;
  kind: string;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string | null;
  cover_image_url: string | null;
  section: string | null;
  author: string | null;
  sort_order: number | null;
  published: boolean;
  published_at: string | null;
};

function shape(row: Row): Post {
  return {
    id: row.id,
    kind: row.kind as PostKind,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMd: row.body_md,
    coverImageUrl: row.cover_image_url,
    section: row.section,
    author: row.author,
    sortOrder: row.sort_order ?? 0,
    published: row.published,
    publishedAt: row.published_at,
  };
}

/**
 * Everything of one kind the caller may see.
 *
 * ORDERED DIFFERENTLY PER KIND, which is the one place the two genuinely
 * differ. A blog is newest first, because the latest post is the point.
 * Documentation is a sequence somebody chose — "getting started" before
 * "advanced" — so it follows sort_order.
 */
export async function listPosts(kind: PostKind): Promise<Post[]> {
  const supabase = await createClient();

  let query = supabase.from("posts").select("*").eq("kind", kind);
  query =
    kind === "blog"
      ? query.order("published_at", { ascending: false, nullsFirst: true })
      : query.order("sort_order", { ascending: true });

  const { data, error } = await query;

  if (error) {
    // An empty blog and an unreadable one look identical on screen, and only
    // one of them is somebody's fault.
    console.error(`[posts] could not read ${kind}:`, error.message);
    return [];
  }
  return (data as unknown as Row[]).map(shape);
}

export async function getPost(
  kind: PostKind,
  slug: string,
): Promise<Post | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("kind", kind)
    .eq("slug", slug)
    .maybeSingle();

  return data ? shape(data as unknown as Row) : null;
}

/**
 * Documentation grouped under its headings, in order.
 *
 * A Map, because insertion order is the order the sections appear and that
 * is exactly what sort_order already gave us — regrouping into an object
 * would throw it away.
 */
export function bySection(posts: Post[]): Map<string, Post[]> {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    // Ungrouped pages still belong somewhere rather than vanishing.
    const key = post.section?.trim() || "Everything else";
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  return groups;
}
