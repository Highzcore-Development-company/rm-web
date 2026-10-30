import { createClient } from "@/lib/supabase/server";

/**
 * The portfolio — what we show the world we have built.
 *
 * READ WITH THE ORDINARY CLIENT, never the service key, and that is the
 * point rather than an oversight. The RLS policy publishes `published = true`
 * to everyone and keeps drafts for whoever holds portfolio.manage, so the
 * public page and the admin page can call the SAME function and get
 * different answers. A filter in here would be a suggestion; the policy is
 * the rule — which is what HS-WEB-v1 asks for in those words.
 */

export type PortfolioProject = {
  id: string;
  slug: string;
  title: string;
  client: string | null;
  summary: string;
  bodyMd: string | null;
  techStack: string[];
  category: string | null;
  coverImageUrl: string | null;
  images: string[];
  year: number | null;
  externalUrl: string | null;
  sortOrder: number;
  published: boolean;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  client: string | null;
  summary: string;
  body_md: string | null;
  tech_stack: string[] | null;
  category: string | null;
  cover_image_url: string | null;
  images: string[] | null;
  year: number | null;
  external_url: string | null;
  sort_order: number | null;
  published: boolean;
};

function shape(row: Row): PortfolioProject {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    client: row.client,
    summary: row.summary,
    bodyMd: row.body_md,
    techStack: row.tech_stack ?? [],
    category: row.category,
    // The cover falls back to the first image. Keeping them in sync is a
    // thing an editor forgets, and a project with pictures and no cover
    // would render as the one blank card in the grid.
    coverImageUrl: row.cover_image_url ?? row.images?.[0] ?? null,
    images: row.images ?? [],
    year: row.year,
    externalUrl: row.external_url,
    sortOrder: row.sort_order ?? 0,
    published: row.published,
  };
}

/** Everything the caller is allowed to see, in the order we pitch it. */
export async function listProjects(): Promise<PortfolioProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_projects")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("year", { ascending: false });

  if (error) {
    // Said out loud. An empty portfolio and an unreadable one look identical
    // on screen, and only one of them is somebody's fault.
    console.error("[portfolio] could not read projects:", error.message);
    return [];
  }
  return (data as unknown as Row[]).map(shape);
}

export async function getProject(slug: string): Promise<PortfolioProject | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portfolio_projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  return data ? shape(data as unknown as Row) : null;
}
