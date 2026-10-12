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

/**
 * HS-BOT-v4 §1 — screens that only exist for an investor.
 *
 * A trader has no broker account with us and never should, so these are GONE
 * for them, not greyed out. Hidden in the UI as well, but this is the lock:
 * a link someone was sent, a bookmark, or a typed URL all arrive here.
 *
 * The database enforces it too — the claim and risk-acknowledgement policies
 * both require account_type = 'investor'. A redirect is a courtesy; the
 * policy is the permission.
 */
const INVESTOR_ONLY = [
  "/app/link-account",
  "/app/onboarding",
  "/app/risk-acknowledgement",
];

/**
 * Screens that only exist for a trader.
 *
 * Checkout is here because of the brief's rule that the investor path has NO
 * checkout: an investor does not self-serve, so there is no page where they
 * buy anything. They enquire, Victor meets them, and the account is set up
 * with them.
 *
 * CONSEQUENCE, stated because it is not obvious: an existing investor with a
 * live subscription can no longer reach the renewal page on their own.
 * Renewal becomes something an admin does. The reminder emails still point at
 * checkout and now need re-pointing — raised, not silently left.
 */
const TRADER_ONLY = ["/app/checkout"];

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

      // A trader is not having their money traded by us, so the broker
      // screens do not apply to them. Sent to the desk rather than shown a
      // 404: they have not done anything wrong, they are just somewhere that
      // is not theirs.
      if (
        investor?.account_type === "trader" &&
        INVESTOR_ONLY.some((p) => pathname.startsWith(p))
      ) {
        redirect("/app/dashboard");
      }

      // And the other way. An investor who finds checkout — from a bookmark,
      // or a renewal email sent before this landed — is sent to the enquiry
      // page, which is where their path actually continues.
      if (
        investor?.account_type === "investor" &&
        TRADER_ONLY.some((p) => pathname.startsWith(p))
      ) {
        redirect("/app/enquiry");
      }

      // The risk acknowledgement is an INVESTOR's. Asking a trader to
      // acknowledge the risk of us trading their money would be a record of
      // something that never happens — and the RLS policy now refuses the
      // write anyway, so the gate would be a loop they could not escape.
      if (
        !adminRow &&
        investor &&
        investor.account_type === "investor" &&
        !investor.risk_acknowledged_at
      ) {
        redirect("/app/risk-acknowledgement");
      }
    }
  }

  return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
}
