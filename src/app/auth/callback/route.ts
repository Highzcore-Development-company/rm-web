import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureInvestor } from "@/lib/investors";
import { safeInternalPath } from "@/lib/safe-path";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Where Supabase sends the user after they click the link in a verification or
 * password-reset email. Exchanges the one-time code for a session, then makes
 * sure the investors row exists (P2-106).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Open redirect guard: `next` comes from a URL anyone can craft, and this
  // route is reached from an email. Relative paths only.
  const safeNext = safeInternalPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/app/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired or already-used link. Say so rather than dumping them on a
    // login page with no explanation of what went wrong.
    return NextResponse.redirect(`${origin}/app/login?error=link_expired`);
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    // Not fatal if this fails — the app layout retries. Better to land them
    // somewhere useful than to block a verified signup on one insert.
    await ensureInvestor(supabase, data.user.id);

    // An OAuth provider has already proven the address belongs to them.
    // Emailing a code to an address Google just vouched for would be friction
    // with no security gained.
    const provider = data.user.app_metadata?.provider;
    if (provider && provider !== "email") {
      await createServiceClient()
        .from("investors")
        .update({ email_verified_at: new Date().toISOString() })
        .eq("user_id", data.user.id)
        .is("email_verified_at", null);
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
