import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductPage } from "@/components/marketing/product-page";
import { PRODUCTS, productBySlug } from "@/lib/products";

/**
 * HS-WEB-v1 item 1 — a landing page per product.
 *
 * ONE ROUTE, SIX PAGES, from lib/products. The brief's rule is that every
 * product has a page of its own, and the completion test is that each answers
 * the same four questions — which is an argument for one route rendering a
 * typed record, not six files that drift.
 *
 * THESE ARE PATHS TODAY AND SUBDOMAINS LATER. The brief moves each product to
 * <slug>.highzcore.tech; the domain is not cut over yet, so /autotrade is the
 * same page the subdomain will serve. One codebase, so the cutover is a host
 * rewrite in proxy.ts rather than a rebuild — see the note there.
 */

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ product: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ product: string }>;
}): Promise<Metadata> {
  const { product: slug } = await params;
  const product = productBySlug(slug);
  if (!product) return {};
  return {
    title: `${product.name} — ${product.tagline}`,
    description: product.what,
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product: slug } = await params;
  const product = productBySlug(slug);
  // Not a product we publish. notFound rather than a redirect: /pricing and
  // /terms are real pages under this group, and silently sending an unknown
  // slug to the index would hide a broken link rather than report it.
  if (!product) notFound();

  return <ProductPage product={product} />;
}
