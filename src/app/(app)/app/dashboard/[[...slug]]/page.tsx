import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Desk } from "@/components/workspace/desk";
import { showsScora } from "@/lib/landing";
import { BotTradeBanner } from "@/components/workspace/bot-trade-banner";
import { getWorkspaceData } from "@/lib/workspace/data";
import { getAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";

export const metadata: Metadata = {
  title: "Workspace",
  description: "Price, context and a second opinion on one screen.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The first screen after signing in.
 *
 * It used to be the Vantage setup checklist, which asked people to open a
 * broker account before showing them one reason to want one. Product 1 — the
 * analysis — is what everybody can use on day one and what we actually sell,
 * so it is what the door opens onto. Product 2 is the single line above it.
 *
 * ONE CATCH-ALL ROUTE, every section a real path: /app/dashboard/markets,
 * /app/dashboard/market/EUR-USD, /app/dashboard/history. Kept from highzcore's
 * desk for the same reasons given there — a refresh lands where you were, Back
 * walks where you have been, and a link names what you are looking at. A
 * folder per section would have duplicated this shell eleven times.
 */
// The slug is not read: the catch-all exists only so old section links still
// resolve here rather than 404ing. `searchParams` IS read — see the admin
// redirect below.
export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  // The (app) layout already gates this, but the page reads the user directly
  // and must not assume the gate ran.
  if (!auth.user) redirect("/app/login?next=%2Fapp%2Fdashboard");

  const investor = await getInvestor(supabase);
  const data = await getWorkspaceData();
  // Null for everybody who is not an admin, which is almost everybody.
  const admin = await getAdmin();

  /**
   * AN ADMIN LANDS IN THE ADMIN AREA. Victor: "It should re-route the user to
   * admin if the user is an admin."
   *
   * Here rather than in the login form, because this is where everything
   * arrives: the form pushes to /app/dashboard, so does the OAuth callback, so
   * does the home page's redirect for a signed-in visitor, and so does a
   * bookmark. Putting it in one of those would leave the other three landing
   * on the investor desk.
   *
   * `?view=investor` IS THE WAY BACK. An admin is also a user and sometimes
   * needs to see what one sees — without the escape hatch the "Investor view"
   * link in the admin profile menu would bounce straight back here, which is
   * the bug this redirect would otherwise introduce.
   */
  const { view } = await searchParams;
  if (admin && view !== "investor") redirect("/app/admin");


  // The route is no longer read. The desk has three tabs held in component
  // state, not eleven sections addressed by URL, so there is nothing left for
  // a slug to select. The catch-all stays so old links keep resolving here
  // instead of 404ing.
  const name = auth.user.email ?? "Signed in";

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <div className="shrink-0 px-3 pt-3">
        <BotTradeBanner
          linked={Boolean(investor?.vantage_account_id && investor?.linked_at)}
          trading={Boolean(data.settings?.trading_enabled)}
        />
      </div>

      <div className="min-h-0 flex-1">
        <Desk
          showScora={showsScora(investor?.account_type ?? null)}
          markets={data.markets}
          closedTrades={data.closedTrades}
          settings={data.settings}
          connected={data.connected}
          user={{ name, initials: initialsOf(name) }}
          // "Then when the person logs in, he sees the admin panel." This is
          // that: the way in, for admins only.
          isAdmin={Boolean(admin)}
        />
      </div>
    </div>
  );
}

/** Two letters from a name, or one from an email. Never an empty circle. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}
