"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAdminAction, requirePermission } from "@/lib/admin";

export type PortfolioResult =
  | { ok: true; slug?: string }
  | { ok: false; error: string; field?: string };

/**
 * The Portfolio and Studio sections — HS-WEB-v1 item 3.
 *
 * Ported from highscore-tech-web's admin, field for field: title, slug,
 * summary, the markdown body, client, category, year, sort order, external
 * link, the comma-separated tech stack and the published switch. Their form
 * is the one Victor already approves of, so the shape is not mine to redesign.
 *
 * WRITES GO THROUGH THE ORDINARY CLIENT, not a service key, so the RLS
 * policy decides. `portfolio.manage` is checked here AND in the database —
 * if this file forgot, the policy would still refuse. That is what
 * HS-WEB-v1 means by "the gate is in the database, not only in the screen".
 *
 * PUBLISHING IS A SEPARATE ACTION from saving. It is the one field that
 * changes who can see a row, and a toggle buried in a form of twelve inputs
 * is a toggle somebody flips by accident.
 */

/** A slug we are willing to put in a URL. */
function cleanSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function guard() {
  const admin = await requirePermission("portfolio.manage");
  if (!admin) return null;
  return admin;
}

export async function saveProject(form: {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  bodyMd: string;
  client: string;
  category: string;
  year: string;
  sortOrder: string;
  externalUrl: string;
  techStack: string;
  coverImageUrl: string;
  images: string;
}): Promise<PortfolioResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const title = form.title.trim();
  const summary = form.summary.trim();
  if (title.length < 2) return { ok: false, error: "bad_title", field: "title" };
  if (summary.length < 2) return { ok: false, error: "bad_summary", field: "summary" };

  // Derived from the title when nobody typed one, because a slug is a URL
  // and a blank one would collide with every other blank.
  const slug = cleanSlug(form.slug || title);
  if (!slug) return { ok: false, error: "bad_slug", field: "slug" };

  const year = form.year.trim() ? Number(form.year) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2200)) {
    return { ok: false, error: "bad_year", field: "year" };
  }

  // Comma-separated in the box, an array in the column. Empty entries are
  // dropped rather than stored as "" — a blank pill renders as a gap.
  const list = (value: string) =>
    value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const payload = {
    slug,
    title,
    summary,
    body_md: form.bodyMd.trim() || null,
    client: form.client.trim() || null,
    category: form.category.trim() || null,
    year,
    sort_order: Number(form.sortOrder) || 0,
    external_url: form.externalUrl.trim() || null,
    tech_stack: list(form.techStack),
    cover_image_url: form.coverImageUrl.trim() || null,
    images: list(form.images),
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();

  if (form.id) {
    const { data, error } = await supabase
      .from("portfolio_projects")
      .update(payload)
      .eq("id", form.id)
      .select("slug");

    // An update that matched nothing is a refusal, not a success — the same
    // rule the bot writes follow, and for the same reason.
    if (error || !data?.length) {
      console.error("[portfolio] save failed:", error?.message);
      return { ok: false, error: error?.code === "23505" ? "slug_taken" : "generic" };
    }
    await recordAdminAction("portfolio.updated", { type: "project", id: form.id });
  } else {
    const { data, error } = await supabase
      .from("portfolio_projects")
      // New projects are DRAFTS. Publishing is its own decision; see below.
      .insert({ ...payload, published: false })
      .select("id, slug")
      .maybeSingle();

    if (error || !data) {
      console.error("[portfolio] create failed:", error?.message);
      return { ok: false, error: error?.code === "23505" ? "slug_taken" : "generic" };
    }
    await recordAdminAction("portfolio.created", {
      type: "project",
      id: data.id as string,
    });
  }

  revalidatePath("/app/admin/portfolio");
  revalidatePath("/build");
  revalidatePath(`/build/${slug}`);
  return { ok: true, slug };
}

/**
 * Publish or unpublish.
 *
 * ITS OWN ACTION because it is the only field that changes who can see the
 * row, and it is audited separately for the same reason.
 */
export async function setProjectPublished(
  id: string,
  published: boolean,
): Promise<PortfolioResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_projects")
    .update({ published, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("slug");

  if (error || !data?.length) return { ok: false, error: "generic" };

  await recordAdminAction(
    published ? "portfolio.published" : "portfolio.unpublished",
    { type: "project", id },
  );

  revalidatePath("/app/admin/portfolio");
  revalidatePath("/build");
  return { ok: true };
}

export async function deleteProject(id: string): Promise<PortfolioResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("portfolio_projects")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: "generic" };

  await recordAdminAction("portfolio.deleted", { type: "project", id });
  revalidatePath("/app/admin/portfolio");
  revalidatePath("/build");
  return { ok: true };
}

/* ---------------------------------------------------------------- studio */

export async function saveStudioWork(form: {
  id?: string;
  title: string;
  client: string;
  projectType: string;
  summary: string;
  videoUrl: string;
  posterUrl: string;
  sortOrder: string;
}): Promise<PortfolioResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const title = form.title.trim();
  if (title.length < 2) return { ok: false, error: "bad_title", field: "title" };

  const video = form.videoUrl.trim();
  const payload = {
    title,
    client: form.client.trim() || null,
    project_type: form.projectType.trim() || null,
    summary: form.summary.trim() || null,
    video_url: video || null,
    // The poster is filled in from YouTube when it is left blank, because a
    // video with no still is a black rectangle until it loads — which reads
    // as broken rather than as loading.
    poster_url: form.posterUrl.trim() || posterFrom(video),
    media_type: video ? "video" : null,
    sort_order: Number(form.sortOrder) || 0,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();

  if (form.id) {
    const { data, error } = await supabase
      .from("studio_works")
      .update(payload)
      .eq("id", form.id)
      .select("id");
    if (error || !data?.length) {
      return { ok: false, error: error?.code === "23505" ? "title_taken" : "generic" };
    }
    await recordAdminAction("studio.updated", { type: "work", id: form.id });
  } else {
    const { data, error } = await supabase
      .from("studio_works")
      .insert({ ...payload, published: false })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return { ok: false, error: error?.code === "23505" ? "title_taken" : "generic" };
    }
    await recordAdminAction("studio.created", {
      type: "work",
      id: data.id as string,
    });
  }

  revalidatePath("/app/admin/portfolio");
  revalidatePath("/studio");
  return { ok: true };
}

export async function setWorkPublished(
  id: string,
  published: boolean,
): Promise<PortfolioResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("studio_works")
    .update({ published, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (error || !data?.length) return { ok: false, error: "generic" };

  await recordAdminAction(
    published ? "studio.published" : "studio.unpublished",
    { type: "work", id },
  );
  revalidatePath("/app/admin/portfolio");
  revalidatePath("/studio");
  return { ok: true };
}

export async function deleteStudioWork(id: string): Promise<PortfolioResult> {
  const admin = await guard();
  if (!admin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.from("studio_works").delete().eq("id", id);
  if (error) return { ok: false, error: "generic" };

  await recordAdminAction("studio.deleted", { type: "work", id });
  revalidatePath("/app/admin/portfolio");
  revalidatePath("/studio");
  return { ok: true };
}

/** YouTube's own thumbnail for a watch URL, or null. */
function posterFrom(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : host.endsWith("youtube.com")
          ? u.searchParams.get("v")
          : null;
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
}
