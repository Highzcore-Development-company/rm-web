import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh and route gating.
 *
 * Two jobs only. Deliberately thinner than the company site's equivalent: this
 * app has one kind of signed-in user, so there is no role routing to do here.
 */

/** Signed-in only. Everything in the application surface. */
const PROTECTED_PREFIXES = ["/app"];

/** Signed-out only. A logged-in user has no business on these. */
const GUEST_ONLY = ["/app/signup", "/app/login", "/app/forgot-password"];

/** Reachable mid-auth regardless of session state. */
const ALWAYS_ALLOWED = ["/auth", "/app/verify-email", "/app/reset-password"];

function matches(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Nothing between createServerClient and getUser(): logic in between can
  // silently invalidate the session.
  //
  // getUser() returns an error for a missing session (that is just "anonymous"),
  // but it can throw when the auth cookie is poisoned — a rotated refresh token
  // that can never succeed. On the company site that throw turned every request
  // into a 500 that reloading could not clear. Retry once for a transient blip.
  let user = null;
  let authThrew = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await supabase.auth.getUser();
      user = res.data.user;
      authThrew = false;
      break;
    } catch {
      authThrew = true;
    }
  }

  const path = request.nextUrl.pathname;

  // Self-heal a poisoned session: drop every Supabase cookie so the browser is
  // cleanly anonymous again, rather than stranding someone on a permanent 500.
  if (authThrew) {
    const stale = request.cookies
      .getAll()
      .map((c) => c.name)
      .filter((n) => n.startsWith("sb-"));
    const clear = (res: NextResponse) => {
      stale.forEach((n) => res.cookies.delete(n));
      return res;
    };

    if (matches(path, PROTECTED_PREFIXES) && !matches(path, ALWAYS_ALLOWED)) {
      const url = request.nextUrl.clone();
      url.pathname = "/app/login";
      url.search = "";
      url.searchParams.set("next", path);
      return clear(NextResponse.redirect(url));
    }
    return clear(NextResponse.next({ request }));
  }

  // The app layout gates unverified accounts and must know where the request
  // is headed, or it would redirect the verify page to itself.
  supabaseResponse.headers.set("x-pathname", path);

  if (matches(path, ALWAYS_ALLOWED)) return supabaseResponse;

  // Anonymous visitor on a protected route.
  if (!user && matches(path, PROTECTED_PREFIXES) && !matches(path, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/login";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Signed-in user on a guest-only route.
  if (user && matches(path, GUEST_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
