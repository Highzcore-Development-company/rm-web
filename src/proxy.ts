import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Never let a client-supplied copy of the header the layout gates on through,
  // even on the fail-open path below.
  request.headers.delete("x-pathname");

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
