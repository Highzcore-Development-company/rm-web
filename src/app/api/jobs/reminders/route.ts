import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAuthorisedJob } from "@/lib/job-auth";
import { isEmailConfigured, renewalReminder, sendEmail } from "@/lib/email";
import { entitlementFrom } from "@/lib/entitlement";
import type { Subscription } from "@/lib/supabase/types";
import { envOr } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** P2-310 — "at 7 days and 1 day before expiry". */
const MILESTONES = [7, 1] as const;

/**
 * Renewal reminders.
 *
 * Run daily. Safe to run more often, and safe to run twice at once: every send
 * is recorded in sent_reminders keyed on (subscription, milestone), and the
 * insert happens BEFORE the send. If the send then fails, that milestone is
 * skipped rather than retried.
 *
 * That ordering is deliberate. The two failure modes are "someone misses one
 * reminder" and "someone gets the same reminder every five minutes until a
 * human notices". The first is a minor annoyance; the second is the kind of
 * thing people unsubscribe over, and it would also be hammering a fresh SMTP
 * reputation. We choose to under-send.
 */
export async function POST(request: Request) {
  if (!isAuthorisedJob(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  const service = createServiceClient();
  const siteUrl = envOr(process.env.NEXT_PUBLIC_SITE_URL, "https://highzcore.com");

  const { data: rows, error } = await service
    .from("subscriptions")
    .select("*")
    .eq("status", "confirmed");

  if (error) {
    console.error("[reminders] could not read subscriptions:", error);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  const subscriptions = (rows ?? []) as Subscription[];

  // Group by investor: the reminder is about their ENTITLEMENT, which is the
  // latest expiry across everything they have bought. Emailing per payment row
  // would warn someone whose first month is expiring while their second is
  // already paid for.
  const byInvestor = new Map<string, Subscription[]>();
  for (const s of subscriptions) {
    byInvestor.set(s.investor_id, [...(byInvestor.get(s.investor_id) ?? []), s]);
  }

  let sent = 0;
  let skipped = 0;

  for (const [investorId, list] of byInvestor) {
    const entitlement = entitlementFrom(list);
    const milestone = MILESTONES.find((m) => entitlement.daysRemaining === m);
    if (!milestone || !entitlement.expiresAt) continue;

    // Attribute the reminder to the payment that actually set the expiry.
    const latest = list
      .filter((s) => s.expires_at)
      .sort((a, b) => (a.expires_at! < b.expires_at! ? 1 : -1))[0];
    if (!latest) continue;

    // Claim it first. A unique violation means another run already has it.
    const { error: claimError } = await service
      .from("sent_reminders")
      .insert({ subscription_id: latest.id, milestone });

    if (claimError) {
      skipped += 1;
      continue;
    }

    const { data: investor } = await service
      .from("investors")
      .select("user_id")
      .eq("id", investorId)
      .maybeSingle();
    if (!investor) continue;

    const { data: account } = await service.auth.admin.getUserById(
      investor.user_id,
    );
    const email = account?.user?.email;
    if (!email) continue;

    // Respect the opt-out. Absent row means defaults, which are all on.
    const { data: prefs } = await service
      .from("notification_preferences")
      .select("subscription_expiring")
      .eq("investor_id", investorId)
      .maybeSingle();

    if (prefs && prefs.subscription_expiring === false) {
      skipped += 1;
      continue;
    }

    const message = renewalReminder({
      daysLeft: milestone,
      expiresAt: entitlement.expiresAt,
      renewUrl: `${siteUrl}/app/checkout`,
    });

    const result = await sendEmail({ to: email, ...message });
    if (result.ok) sent += 1;
    else skipped += 1;
  }

  return NextResponse.json({ sent, skipped });
}
