import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureInvestor, getInvestor } from "@/lib/investors";

/**
 * The application surface: signup, dashboard, billing, charts — everything
 * under /app.
 *
 * It also holds the verification gate. P2-106 says email verification is
 * required "before anything else", and the only way to mean that is to check
 * it on every route beneath here rather than on the pages someone remembered
 * to add it to.
 *
 * The check is OUR flag, not Supabase's. Supabase is set to auto-confirm —
 * otherwise it would try to send its own mail — so its email_confirmed_at is
 * true the moment an account exists and means nothing.
 */

/** Reachable while unverified: the gate itself, and the way back out. */
const UNGATED = [
  "/app/verify-email",
  "/app/risk-acknowledgement",
  "/app/login",
  "/app/signup",
  "/app/forgot-password",
  "/app/reset-password",
];

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Stamped by the proxy on every request. Without it this layout would send
  // the verify page to itself and loop.
  const stamped = (await headers()).get("x-pathname");
  const pathname = stamped ?? "";

  if (stamped === null) {
    // Treated as ungated for this render: guessing a path here is how the
    // redirects below would loop. Say so loudly instead of failing quietly.
    console.error(
      "[app layout] x-pathname header missing; skipping the session and verification gate. Check the proxy.",
    );
  }

  const ungated =
    stamped === null || UNGATED.some((p) => pathname.startsWith(p));

  if (!ungated) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();

    // The proxy sends anonymous visitors to login too; this is the second
    // lock on the same door, for any path the proxy matcher does not cover.
    if (!auth.user) {
      redirect(
        `/app/login?next=${encodeURIComponent(pathname || "/app/dashboard")}`,
      );
    }

    if (auth.user) {
      // Google and password signups both land here with a session and no row
      // yet; creating it at the gate means no page below has to wonder.
      const investor =
        (await getInvestor(supabase)) ??
        (await ensureInvestor(supabase, auth.user.id));

      if (investor && !investor.email_verified_at) {
        redirect(
          `/app/verify-email?email=${encodeURIComponent(auth.user.email ?? "")}`,
        );
      }

      // P2-104. The email form has its own checkbox, but Google signup never
      // saw one — and a disclosure that one of two routes in can skip is not
      // "shown during signup". Checked here so the route taken cannot matter.
      //
      // INVESTORS ONLY. Staff are not asked to acknowledge the risk of
      // trading their own money, because they are not trading it: the bot
      // trades one master account and an admin configures it. Every signed-in
      // user gets an investors row — ensureInvestor above creates one, and
      // getAdmin() needs it for the email-verification flag — so having a row
      // is not evidence that someone is an investor. Membership of app_admins
      // is what distinguishes them.
      //
      // The verification gate above still applies to admins. That one is
      // about proving you own the inbox, which matters more for an account
      // that can disable users and read financials, not less.
      const { data: adminRow } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .is("disabled_at", null)
        .maybeSingle();

      if (!adminRow && investor && !investor.risk_acknowledged_at) {
        redirect("/app/risk-acknowledgement");
      }
    }
  }

  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
