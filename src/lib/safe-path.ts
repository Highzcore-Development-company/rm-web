const PLACEHOLDER_ORIGIN = "http://local.invalid";

/**
 * Only a same-origin path ever comes back; anything else is the fallback.
 *
 * `startsWith("/") && !startsWith("//")` is not enough. Browsers treat `\` as
 * `/` and strip tabs and newlines, so `/\evil.com` and `/<tab>/evil.com` both
 * leave the site. Resolving against a placeholder origin and checking where it
 * landed catches those, and the pathname check catches inputs the URL parser
 * normalises into `//host` (`/..//evil.com`).
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback = "/app/onboarding",
): string {
  if (!raw || raw[0] !== "/" || /[\t\n\r]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }

  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) {
    return fallback;
  }

  return url.pathname + url.search;
}
