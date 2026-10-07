import { envOr } from "@/lib/env";

/**
 * The canonical origin. Metadata, sitemap and robots all need an absolute URL,
 * and hardcoding one breaks preview deploys while a relative one is invalid in
 * a sitemap.
 */
export function siteUrl(): string {
  // envOr, not ??: a blank NEXT_PUBLIC_SITE_URL is a string, and new URL("")
  // throws at build time.
  const raw = envOr(
    process.env.NEXT_PUBLIC_SITE_URL,
    // Netlify sets this on deploy previews and production alike.
    envOr(process.env.URL, "https://highzcore.com"),
  );
  return raw.replace(/\/$/, "");
}
