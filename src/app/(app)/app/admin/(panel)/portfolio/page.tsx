import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import {
  PortfolioEditor,
  type AdminProject,
  type AdminWork,
} from "@/components/admin/portfolio-editor";

export const metadata: Metadata = { title: "Portfolio", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * HS-WEB-v1 item 3 — Portfolio, as a grantable section.
 *
 * "Add and manage the projects in our portfolio — what we show the world we
 * have built." Esther: "in the admin page I didn't see where I can add to
 * the portfolio", and she was right. The rows were imported and the public
 * pages built; the only way to add one was a SQL statement.
 *
 * TWO TABS, ONE PERMISSION. The portfolio and the studio reel are the same
 * job — what we show the world — and splitting them would mean granting two
 * permissions to let somebody do one thing.
 *
 * READ WITH THE ORDINARY CLIENT so RLS decides. Holding portfolio.manage is
 * what returns the drafts; without it the same query returns only what is
 * public, and the page would show a reader exactly what a visitor sees. The
 * requirePermission above is the courtesy, the policy is the rule.
 */
export default async function AdminPortfolioPage() {
  if (!(await requirePermission("portfolio.manage"))) notFound();

  const supabase = await createClient();

  const [{ data: projectRows }, { data: workRows }] = await Promise.all([
    supabase
      .from("portfolio_projects")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("year", { ascending: false }),
    supabase
      .from("studio_works")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  const projects: AdminProject[] = (projectRows ?? []).map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    title: p.title as string,
    client: p.client as string | null,
    summary: p.summary as string,
    bodyMd: p.body_md as string | null,
    techStack: (p.tech_stack as string[] | null) ?? [],
    category: p.category as string | null,
    coverImageUrl: p.cover_image_url as string | null,
    images: (p.images as string[] | null) ?? [],
    year: p.year as number | null,
    externalUrl: p.external_url as string | null,
    sortOrder: (p.sort_order as number | null) ?? 0,
    published: p.published as boolean,
  }));

  const works: AdminWork[] = (workRows ?? []).map((w) => ({
    id: w.id as string,
    title: w.title as string,
    client: w.client as string | null,
    projectType: w.project_type as string | null,
    summary: w.summary as string | null,
    videoUrl: w.video_url as string | null,
    posterUrl: w.poster_url as string | null,
    published: w.published as boolean,
  }));

  return (
    <div className="max-w-4xl">
      <h1 className="sr-only">Portfolio</h1>

      <p className="max-w-prose text-xs leading-relaxed text-fg-muted">
        What we show the world we have built. Anything you add starts as a
        draft — nothing is public until you publish it, and that is a separate
        button on purpose.
      </p>

      <div className="mt-6">
        <PortfolioEditor projects={projects} works={works} />
      </div>
    </div>
  );
}
