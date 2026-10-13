import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requirePermission } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  formatCost,
  summariseUsage,
  type UsageRow,
} from "@/lib/admin/scora-usage";

export const metadata: Metadata = { title: "Scora usage", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * HS-BOT-v4 §3 — what Scora costs us.
 *
 * "Count usage per account. We need to know what a subscriber costs us before
 * we find out the expensive way." The tokens were already being recorded; this
 * is the screen that makes that sentence true, because a number nobody reads
 * tells you nothing before the bill does.
 *
 * Gated on finance.view rather than bot.view: this is a question about money.
 */
export default async function ScoraUsagePage() {
  if (!(await requirePermission("finance.view"))) notFound();

  const service = createServiceClient();

  const [{ data: messages }, { data: conversations }] = await Promise.all([
    service
      .from("scora_messages")
      .select("model, prompt_tokens, completion_tokens, created_at, conversation_id")
      .not("completion_tokens", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000),
    service.from("scora_conversations").select("id, investor_id"),
  ]);

  const owners = new Map(
    (conversations ?? []).map((c) => [c.id as string, c.investor_id as string]),
  );
  const usage = summariseUsage((messages ?? []) as UsageRow[], owners);

  // Emails for the per-person split. Only for the people who actually used it,
  // so this does not page through every account to label an empty table.
  const emails = new Map<string, string>();
  if (usage.byPerson.length) {
    const { data: investors } = await service
      .from("investors")
      .select("id, user_id")
      .in("id", usage.byPerson.map((p) => p.investorId));

    await Promise.all(
      (investors ?? []).map(async (i) => {
        const account = await service.auth.admin.getUserById(i.user_id);
        emails.set(i.id as string, account.data?.user?.email ?? "(unknown)");
      }),
    );
  }

  const tokens = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(0)}k`
        : String(n);

  return (
    <div>
      <h1 className="display text-3xl font-semibold">Scora usage</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        What Scora has cost, and who is spending it. Priced at the provider&apos;s
        list rates, so treat it as close rather than exact — the invoice is the
        invoice.
      </p>

      {usage.messages === 0 ? (
        <p className="mt-8 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          Scora has not answered anything yet. Figures appear after the first
          question.
        </p>
      ) : (
        <>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                Cost to date
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                {formatCost(usage.costCents)}
              </dd>
            </Card>
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                Per person using it
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                {formatCost(usage.costPerPersonCents)}
              </dd>
              {/* Said out loud, because the obvious reading is wrong: this is
                  not divided by everyone who pays us. */}
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                Averaged over the {usage.byPerson.length} who have actually
                asked something, not over every subscriber.
              </p>
            </Card>
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                Answers
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                {usage.messages}
              </dd>
            </Card>
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                Tokens in / out
              </dt>
              <dd className="mt-2 text-xl font-semibold tabular-nums">
                {tokens(usage.promptTokens)} / {tokens(usage.completionTokens)}
              </dd>
              <p className="mt-2 text-xs text-fg-muted">
                {usage.models.join(", ") || "unknown model"}
              </p>
            </Card>
          </dl>

          {usage.hasUnpricedModel && (
            <p className="mt-4 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-xs leading-relaxed">
              Costed at a fallback rate, because these have no price in the
              table: <code>{usage.models.join(", ")}</code>. The real figure
              will differ. Add them from the provider&apos;s pricing page in{" "}
              <code>lib/admin/scora-usage.ts</code>.
            </p>
          )}

          <section className="mt-10">
            <h2 className="text-lg font-semibold">By person</h2>
            <p className="mt-2 max-w-2xl text-sm text-fg-muted">
              Most expensive first. One heavy user costs more than a hundred
              light ones, and an average hides that.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Person</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Cost</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Answers</th>
                    <th scope="col" className="py-2 text-right font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usage.byPerson.map((p) => (
                    <tr key={p.investorId}>
                      <th scope="row" className="py-2.5 pr-4 font-normal">
                        {emails.get(p.investorId) ?? "(unknown)"}
                      </th>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {formatCost(p.costCents)}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                        {p.messages}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-fg-muted">
                        {tokens(p.promptTokens + p.completionTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">By day</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Cost</th>
                    <th scope="col" className="py-2 text-right font-medium">Answers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usage.byDay.slice(0, 30).map((d) => (
                    <tr key={d.date}>
                      <th scope="row" className="py-2.5 pr-4 font-normal tabular-nums">
                        {d.date}
                      </th>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {formatCost(d.costCents)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-fg-muted">
                        {d.messages}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
