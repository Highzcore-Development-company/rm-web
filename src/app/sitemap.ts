import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Public pages only. Anything under /app is excluded by robots.ts too. */
const ROUTES = [
  { path: "", priority: 1.0, changeFrequency: "weekly" as const },
  { path: "/how-it-works", priority: 0.9, changeFrequency: "monthly" as const },
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" as const },
  // The live record updates whenever the bot closes a trade, so it earns a
  // daily crawl — it is also the page most likely to be linked to.
  { path: "/performance", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/api-docs", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/api-terms", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/risk-disclosure", priority: 0.4, changeFrequency: "yearly" as const },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
