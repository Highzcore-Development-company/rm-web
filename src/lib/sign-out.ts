import { createClient } from "@/lib/supabase/client";

/**
 * Sign out, and actually leave.
 *
 * The obvious version does not work here:
 *
 *     await supabase.auth.signOut();
 *     router.push("/");
 *     router.refresh();
 *
 * It clears the cookies, then asks Next's CLIENT router to go home. The home
 * page redirects a signed-in visitor to /app/dashboard — and the router may
 * answer that navigation from its cached RSC payload, fetched moments earlier
 * while the session was still valid. So you land on "/", the cached page says
 * "you are signed in", and you bounce straight back to the desk. The sign-out
 * worked; the navigation lied about it.
 *
 * router.refresh() after router.push() does not help either: by then the
 * redirect has already happened.
 *
 * A full document navigation is the fix. It discards every client cache and
 * makes the browser ask the server for "/" with the cookies as they now are —
 * which is to say, without a session.
 *
 * replace() rather than assign(), so the Back button does not return to a
 * signed-in page that no longer has a session behind it.
 */
export async function signOutAndGoHome(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  window.location.replace("/");
}
