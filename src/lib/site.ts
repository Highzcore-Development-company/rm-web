/**
 * The canonical origin. Metadata, sitemap and robots all need an absolute URL,
 * and hardcoding one breaks preview deploys while a relative one is invalid in
 * a sitemap.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    // Netlify sets this on deploy previews and production alike.
    (process.env.URL ? process.env.URL : "https://highzcore.com");
  return raw.replace(/\/$/, "");
}
