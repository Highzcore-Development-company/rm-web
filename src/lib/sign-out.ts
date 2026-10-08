/**
 * Sign out, and actually leave.
 *
 * TWO THINGS HAD TO BE TRUE, and each was its own bug.
 *
 * 1. The cookies must really be gone. `supabase.auth.signOut()` on the browser
 *    client resolved without error and left them in place, so the next request
 *    still carried a session. The sign-out is therefore done by POSTing to
 *    /auth/sign-out, where the server owns the cookie store and answers with
 *    the Set-Cookie headers that clear it. `credentials: "same-origin"` so the
 *    request carries the session it is meant to destroy.
 *
 * 2. The navigation must not come out of a cache. Next's client router can
 *    answer a push to "/" from an RSC payload fetched while the session was
 *    still valid — and the home page redirects a signed-in visitor to
 *    /app/dashboard, so you bounce straight back. router.refresh() afterwards
 *    is too late; the redirect has already happened.
 *
 * window.location.replace() settles the second: a full document navigation
 * discards every client cache and asks the server for "/" with the cookies as
 * they now are. replace() rather than assign(), so Back does not return to a
 * signed-in page with no session behind it.
 */
export async function signOutAndGoHome(): Promise<void> {
  try {
    await fetch("/auth/sign-out", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Network failed. Leave anyway — staying on a page that believes it is
    // signed in is the worse outcome, and the server rejects the stale
    // session on the next request regardless.
  }
  window.location.replace("/");
}
