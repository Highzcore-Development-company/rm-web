"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAdminAction, requirePermission } from "@/lib/admin";

export type ContentResult =
  | { ok: true; slug?: string }
  | { ok: false; error: string };

/**
 * Writing the blog and the documentation.
 *
 * Esther: "we have to add blogs and doc on admin so she can add to it."
 * Olivia's half of HS-WEB-v1 is the content, and she had nowhere to put it.
 *
 * SAME PERMISSION AS THE PORTFOLIO. All of it is "what we show the world",
 * and three separate grants to let one person do one job is a permission
 * model nobody would use correctly.
 *
 * PUBLISHING SETS published_at ONCE, the first time, and never again. The
 * date a post went out does not change because somebody fixed a typo in it
 * two weeks later — and a blog ordered by a date that moves is a blog whose
 * front page reshuffles itself for no reason anybody can see.
 */

type PostKind = "blog" | "doc";

function cleanSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function guard() {
  return requirePermission("portfolio.manage");
}

export async function savePost(form: {
  id?: string;
  kind: PostKind;
  title: string;
  slug: string;
  excerpt: string;
  bodyMd: string;
  section: string;
  author: string;
  coverImageUrl: string;
  sortOrder: string;
}): Promise<ContentResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const title = form.title.trim();
  const excerpt = form.excerpt.trim();
  if (title.length < 2) return { ok: false, error: "bad_title" };
  // Required, not optional: a list of titles with no explanation under them
  // is a table of contents, not something anybody reads.
  if (excerpt.length < 2) return { ok: false, error: "bad_excerpt" };

  const slug = cleanSlug(form.slug || title);
  if (!slug) return { ok: false, error: "bad_slug" };

  const payload = {
    kind: form.kind,
    slug,
    title,
    excerpt,
    body_md: form.bodyMd.trim() || null,
    // Docs are grouped under headings; a blog post has none.
    section: form.kind === "doc" ? form.section.trim() || null : null,
    author: form.author.trim() || null,
    cover_image_url: form.coverImageUrl.trim() || null,
    sort_order: Number(form.sortOrder) || 0,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();

  if (form.id) {
    const { data, error } = await supabase
      .from("posts")
      .update(payload)
      .eq("id", form.id)
      .select("slug");

    // An update that matched nothing is a refusal, not a success.
    if (error || !data?.length) {
      return {
        ok: false,
        error: error?.code === "23505" ? "slug_taken" : "generic",
      };
    }
    await recordAdminAction("content.updated", { type: form.kind, id: form.id });
  } else {
    const { data, error } = await supabase
      .from("posts")
      // Always a draft. Writing in the open is worse than not writing.
      .insert({ ...payload, published: false })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        error: error?.code === "23505" ? "slug_taken" : "generic",
      };
    }
    await recordAdminAction("content.created", {
      type: form.kind,
      id: data.id as string,
    });
  }

  revalidatePath("/app/admin/content");
  revalidatePath(form.kind === "blog" ? "/blog" : "/docs");
  revalidatePath(`/${form.kind === "blog" ? "blog" : "docs"}/${slug}`);
  return { ok: true, slug };
}

export async function setPostPublished(
  id: string,
  published: boolean,
): Promise<ContentResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();

  // Read it first, because publishing for the FIRST time is different from
  // publishing again — see the note at the top.
  const { data: existing } = await supabase
    .from("posts")
    .select("kind, published_at")
    .eq("id", id)
    .maybeSingle();

  const patch: {
    published: boolean;
    updated_at: string;
    published_at?: string;
  } = { published, updated_at: new Date().toISOString() };

  if (published && !existing?.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("posts")
    .update(patch)
    .eq("id", id)
    .select("kind");

  if (error || !data?.length) return { ok: false, error: "generic" };

  await recordAdminAction(published ? "content.published" : "content.unpublished", {
    type: (existing?.kind as string) ?? "post",
    id,
  });

  revalidatePath("/app/admin/content");
  revalidatePath("/blog");
  revalidatePath("/docs");
  return { ok: true };
}

export async function deletePost(id: string): Promise<ContentResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return { ok: false, error: "generic" };

  await recordAdminAction("content.deleted", { type: "post", id });
  revalidatePath("/app/admin/content");
  revalidatePath("/blog");
  revalidatePath("/docs");
  return { ok: true };
}
