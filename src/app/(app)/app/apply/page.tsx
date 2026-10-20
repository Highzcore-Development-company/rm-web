import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getInvestor } from "@/lib/investors";
import { ApplicationForm } from "@/components/apply/application-form";

export const metadata: Metadata = {
  title: "Managed trading application",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * HS-BOT-v4 item 9 — where an investor applies.
 *
 * An investor is a BUSINESS whose own Vantage account the bot trades, which
 * is a different relationship from a Scora subscription, so this is a
 * different form from the shared signup. Traders never see it.
 *
 * IT CREATES AN APPLICATION, NOT AN INVESTOR. Submitting sets submitted_at
 * and puts it in front of an admin; status stays `pending` and the broker
 * account is linked by a human after a call. Nothing on this page can change
 * that — the column grants do not reach status or linked_at.
 */
export default async function ApplyPage() {
  const supabase = await createClient();
  const investor = await getInvestor(supabase);

  // A trader has no broker account and never will. Sent to the desk rather
  // than shown a company form that has nothing to do with them.
  if (!investor || investor.account_type === "trader") {
    redirect("/app/dashboard");
  }

  const { data: owners } = await supabase
    .from("investor_owners")
    .select("id, full_name, share_percent, is_director")
    .eq("investor_id", investor.id)
    .order("created_at", { ascending: true });

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="display text-3xl font-semibold">
          Managed trading application
        </h1>

        {/* Said before the first field. Somebody filling this in is deciding
            whether to put a company account under our bot, and the custody
            answer is what decides it. */}
        <ul className="mt-6 space-y-2 text-sm leading-relaxed text-fg-muted">
          <li>
            The money stays in your company&apos;s own Vantage account, in your
            name. We never hold it.
          </li>
          <li>
            You grant permission to trade only — never to withdraw.
          </li>
          <li>
            Submitting this does not start anything. We review it, speak to
            you, and set the account up together.
          </li>
        </ul>

        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-fg-muted">
          {/* The thing most likely to stop somebody starting at all. */}
          You do not have to finish in one sitting. Every section saves as you
          go, and you can close this and come back.
        </p>

        <div className="mt-10">
          <ApplicationForm
            investor={investor}
            owners={(owners ?? []).map((o) => ({
              id: o.id as string,
              fullName: o.full_name as string,
              sharePercent: o.share_percent as number | null,
              isDirector: o.is_director as boolean,
            }))}
          />
        </div>
      </div>
    </Container>
  );
}
