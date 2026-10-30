/**
 * HS-WEB-v1 — which subdomain is this, and what should it serve.
 *
 * ONE CODEBASE, EIGHT DOORS. Esther, 29 Oct: "one code base." So every
 * subdomain is this same application, and the host decides which part of it
 * a visitor lands on. The alternative — eight deploys — would mean eight
 * places to update a shared component and eight chances for them to disagree.
 *
 * A REWRITE, NOT A REDIRECT. autotrade.highzcore.tech must stay in the
 * address bar; sending it to /autotrade would show the visitor the plumbing
 * and undo the point of giving each product a door of its own.
 *
 * NOTHING HAPPENS ON highzcore.com. It has no subdomains, so `rewriteFor`
 * returns null for every host on the old domain and that site behaves
 * exactly as it always has. The .tech subdomains are live, and this table is
 * what makes each one serve its own page out of the same deploy.
 *
 * Pure and dependency-free so it can be unit tested without a request: host
 * in, path out.
 */

/** Subdomain -> the path that serves it. */
const SUBDOMAIN_ROOT: Record<string, string> = {
  // The products. Each is a page under /[product].
  autotrade: "/autotrade",
  analysis: "/analysis",
  build: "/build",
  studio: "/studio",
  blog: "/blog",
  docs: "/docs",

  // The platform, both doors. Same destination on purpose: the brief says
  // "one platform, two doors… same dashboard — the permissions decide what
  // shows", so routing them apart would be the start of two platforms.
  admin: "/app/admin",
  staff: "/app/admin",
};

/**
 * Hosts that are the root of the site rather than a product.
 *
 * The root serves `/`, which is the company index — so there is nothing to
 * rewrite and this returns null for them.
 */
const ROOTS = new Set(["highzcore.tech", "www.highzcore.tech"]);

/**
 * The subdomain label, or null when there is not one we route on.
 *
 * Port is stripped so this works against localhost:3000, and the comparison
 * is lowercased because Host is case-insensitive and proxies do not agree
 * about it.
 */
export function subdomainOf(host: string | null): string | null {
  if (!host) return null;
  const clean = host.split(":")[0].toLowerCase().trim();

  if (ROOTS.has(clean)) return null;
  if (!clean.endsWith(".highzcore.tech")) return null;

  const label = clean.slice(0, -".highzcore.tech".length);
  // Only one level. "a.b.highzcore.tech" is not a door we opened, and
  // treating it as one would route an unexpected host into the admin panel.
  if (!label || label.includes(".")) return null;
  return label;
}

/**
 * The path this request should be rewritten to, or null to leave it alone.
 *
 * ONLY THE ROOT OF THE SUBDOMAIN IS REWRITTEN. autotrade.highzcore.tech/ goes
 * to /autotrade; autotrade.highzcore.tech/pricing stays /pricing, because the
 * shared pages — pricing, terms, the app itself — are the same pages on every
 * door and rewriting them under a product prefix would 404 all of them.
 *
 * The one exception is the platform: admin. and staff. land inside /app/admin
 * and everything beneath it is already a real path.
 */
export function rewriteFor(host: string | null, pathname: string): string | null {
  const label = subdomainOf(host);
  if (!label) return null;

  const root = SUBDOMAIN_ROOT[label];
  // A subdomain we have not opened. Left alone rather than guessed at — DNS
  // can point anything at us, and inventing a route for it is how an unknown
  // host ends up somewhere it should not be.
  if (!root) return null;

  if (pathname === "/" || pathname === "") return root;
  return null;
}
