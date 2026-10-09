import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out on the SERVER, because the browser could not do it.
 *
 * `supabase.auth.signOut()` from the browser client resolved, and the session
 * cookies survived it — so the next request still carried a session, the home
 * page redirected a "signed-in" visitor to /app/dashboard, and sign-out looked
 * like a no-op. Moving to a full page navigation did not help: the cookies
 * were genuinely still there.
 *
 * Here the cookie store is ours. signOut() revokes the session and the
 * response carries the Set-Cookie headers that clear it — and because this is
 * a real HTTP response rather than a client-side state change, the browser has
 * no choice about honouring them.
 *
 * Belt and braces: every `sb-` cookie is deleted explicitly afterwards.
 * Supabase chunks large sessions across `sb-<ref>-auth-token.0`, `.1` and so
 * on, and a stale chunk left behind is enough to look like a session.
 *
 * POST, not GET: this changes state, and a GET would be followed by link
 * prefetching and anything else that crawls URLs.
 *
 * /auth is in ALWAYS_ALLOWED, so the middleware lets this through regardless
 * of session state — which it has to, since the whole point is to arrive here
 * with a session and leave without one.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });

  const { cookies } = await import("next/headers");
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}
