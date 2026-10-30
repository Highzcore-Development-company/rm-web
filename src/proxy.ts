import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { rewriteFor } from "@/lib/subdomain";

export async function proxy(request: NextRequest) {
  // Never let a client-supplied copy of the header the layout gates on through,
  // even on the fail-open path below.
  request.headers.delete("x-pathname");

  /**
   * HS-WEB-v1 — one codebase, eight doors.
   *
   * Each product gets a subdomain of highzcore.tech and this is what makes
   * them the same application: the host decides which page the root of that
   * door serves, and the address bar keeps the subdomain because it is a
   * rewrite rather than a redirect.
   *
   * INERT TODAY. highzcore.com has no subdomains, so rewriteFor returns null
   * for every host we currently serve and nothing about the live site
   * changes. When the domain moves, this table and DNS are the cutover —
   * which is the thing one codebase was supposed to buy.
   *
   * BEFORE the session work, deliberately: this only ever changes WHICH page
   * renders, never who is signed in, and doing it first keeps the auth path
   * reading the URL the application will actually serve.
   */
  const rewrite = rewriteFor(request.headers.get("host"), request.nextUrl.pathname);
  if (rewrite) {
    const url = request.nextUrl.clone();
    url.pathname = rewrite;
    return NextResponse.rewrite(url);
  }

  // Fail open. Middleware runs on every route, so a throw here takes the whole
  // site down — on Netlify that surfaces as "edge function invocation failed",
  // including on the marketing pages, which do not need auth at all. Every
  // protected page re-checks the session server-side, so letting a request
  // through loses nothing.
  try {
    return await updateSession(request);
  } catch (err) {
    console.error("[proxy] updateSession threw, passing through:", err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
