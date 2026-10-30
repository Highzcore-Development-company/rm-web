import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostArticle } from "@/components/marketing/post-article";
import { getPost } from "@/lib/posts";

export const dynamic = "force-dynamic";

/**
 * One blog page.
 *
 * A DRAFT 404s HERE WITHOUT THIS FILE DECIDING SO. getPost reads through
 * RLS, so an unpublished page is simply not returned to a visitor — and IS
 * returned to somebody holding portfolio.manage, which is how they preview
 * before publishing. One URL, two answers, decided by the database.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost("blog", slug);
  if (!post) return {};
  return {
    title: `${post.title} — Highzcore`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost("blog", slug);
  if (!post) notFound();
  return <PostArticle post={post} />;
}
