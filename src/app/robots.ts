import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * The /app surface is signed-in, per-investor and has nothing a search engine
 * should index — and letting it crawl /app/checkout or /app/onboarding would
 * surface half-finished funnel pages as search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/auth/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
