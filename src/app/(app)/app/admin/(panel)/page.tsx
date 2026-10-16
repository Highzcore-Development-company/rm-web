import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import { getAdmin } from "@/lib/admin";
import { getAdminOverview } from "@/lib/admin/overview";
import { ProgressChart } from "@/components/admin/progress-chart";
import { CompositionChart } from "@/components/admin/composition-chart";
import { Signed } from "@/components/admin/signed";
import { formatUsd } from "@/lib/pricing";
import { formatNgn, formatUsdt } from "@/lib/money";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The admin overview.
 *
 * Victor's order, kept: what is on the bot, what it has made, the progress
 * chart, how many markets, then users, subscribers and revenue.
 *
 * THE TWO BOOKS NEVER MEET. The first half is the master trading account —
 * money belonging to the investors mirroring it. The second is ours, from
 * subscriptions. They sit under separate headings with the distinction stated,
 * because the single most expensive mistake available on this page is adding
 * them together. lib/admin/trading-pnl.ts says the same from the other side.
 */
export default async function AdminOverviewPage() {
  const admin = await getAdmin();
  const canSeeBot = admin?.permissions.includes("bot.view") ?? false;
  const canSeeFinance = admin?.permissions.includes("finance.view") ?? false;

  const { bot, business } = await getAdminOverview();

  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const stale = staleness(bot.lastSeenAt);

  return (
    <div className="space-y-10">
      {/* NO VISIBLE PAGE TITLE. Victor, 16 Oct: "remove all title from each
          pages, I don't like it... Keep it without any title." The sidebar
          already says which page this is, so the heading and its blurb were
          repeating it back.

          The h1 stays, screen-reader-only: a document with no h1 gives an
          assistive reader no landmark to jump to and no idea what it has
          landed on, and "invisible" is not the same as "absent". */}
      <h1 className="sr-only">Overview</h1>

      {canSeeBot ? (
        <section>
          <SectionHead
            title="Trading account"
            note="The master account the bot trades. This money belongs to the investors mirroring it — it is not company revenue."
          />

          {!bot.connected ? (
            <Unavailable>
              rm-server is not configured, so nothing here can be read. Set
              RM_SERVER_SUPABASE_URL and RM_SERVER_SUPABASE_ANON_KEY.
            </Unavailable>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Balance"
                  value={bot.balance === null ? null : money(bot.balance)}
                  note="Settled cash at the broker"
                  icon={<Wallet className="size-4" aria-hidden="true" />}
                />
                <Stat
                  label="Equity"
                  value={bot.equity === null ? null : money(bot.equity)}
                  note={
                    bot.floating === null
                      ? "Balance plus open positions"
                      : `${bot.floating >= 0 ? "+" : "−"}$${Math.abs(bot.floating).toFixed(2)} floating`
                  }
                />
                <Stat
                  label="Made all time"
                  value={<Signed value={bot.closed.net} format={money} />}
                  note={`${bot.closed.trades} closed · ${bot.closed.wins}W / ${bot.closed.losses}L`}
                />
                <Stat
                  label="Today"
                  value={
                    bot.today.trades === 0 ? (
                      "—"
                    ) : (
                      <Signed value={bot.today.net} format={money} />
                    )
                  }
                  note={
                    bot.today.trades === 0
                      ? "Nothing closed today"
                      : `${bot.today.trades} closed · ${bot.today.wins}W / ${bot.today.losses}L`
                  }
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Win rate"
                  value={winRateOf(bot.closed)}
                  note="Of trades that won or lost. Scratches excluded."
                  small
                />
                <Stat
                  label="Profit factor"
                  value={
                    bot.closed.profitFactor === null
                      ? "No losses yet"
                      : bot.closed.profitFactor.toFixed(2)
                  }
                  note="Gross profit over gross loss"
                  small
                />
                <Stat
                  label="Markets"
                  value={`${bot.markets.enabled} of ${bot.markets.total}`}
                  note="Enabled, of those configured"
                  small
                  href="/app/admin/markets"
                />
                <Stat
                  label="Open now"
                  value={
                    bot.openPositions === 0 ? (
                      "Flat"
                    ) : (
                      <>
                        {bot.openPositions}{" "}
                        <span className="text-base font-normal text-fg-muted">
                          (<Signed value={bot.openPnl} format={money} />)
                        </span>
                      </>
                    )
                  }
                  note={
                    bot.tradingEnabled === false
                      ? "Trading is switched OFF"
                      : "Positions the broker holds"
                  }
                  small
                  tone={bot.tradingEnabled === false ? "warn" : undefined}
                  href="/app/admin/chart"
                />
              </div>

              {stale ? (
                <p className="mt-4 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-xs leading-relaxed">
                  <strong className="font-medium">
                    The bot has not written for {stale}.
                  </strong>{" "}
                  Every figure above is as of its last write, not as of now.
                  Check that run_live, quote_feed and bar_sync are up on the VM.
                </p>
              ) : null}

              <div className="mt-6">
                <ProgressChart series={bot.progress} />
              </div>

              {/* The compositions. Each answers a question the totals above
                  cannot: a net figure nets the stop-outs against the winners,
                  so "how do our trades actually end" is invisible in it. */}
              <div className="mt-6 grid gap-4 xl:grid-cols-3">
                <CompositionChart
                  title="Won, lost, scratched"
                  note="Every closed trade, judged on net result after costs. The win rate above divides by decided trades only — scratches are visible here."
                  composition={bot.composition.outcome}
                />
                <CompositionChart
                  title="How trades end"
                  note="The bot's own close reason. If stop-outs dominate, that is the story about the strategy, and a net total hides it."
                  composition={bot.composition.closeReason}
                />
                <CompositionChart
                  title="Long or short"
                  note="Direction against result. Your first rule is never to trade against the trend — this is how you tell whether it is doing any work."
                  composition={bot.composition.direction}
                />
              </div>
            </>
          )}
        </section>
      ) : null}

      <section>
        <SectionHead
          title="People"
          note="Customers only. Admins are in-house and come out of every count."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Users"
            value={String(business.users)}
            note={`${business.newThisMonth} joined this month`}
            href="/app/admin/users"
          />
          <Stat
            label="Subscribed"
            value={String(business.subscribed)}
            note={
              business.users === 0
                ? "Nobody yet"
                : `${Math.round((business.subscribed / business.users) * 100)}% of users`
            }
          />
          <Stat
            label="Expiring in 7 days"
            value={String(business.summary.expiringSoon)}
            note="Paid up, but running out"
            tone={business.summary.expiringSoon > 0 ? "warn" : undefined}
          />
          <Stat
            label="Lapsed"
            value={String(business.summary.lapsed)}
            note="Past grace — flagged for MAM detachment"
            tone={business.summary.lapsed > 0 ? "warn" : undefined}
            href="/app/admin/billing"
          />
        </div>
      </section>

      {canSeeFinance ? (
        <section>
          <SectionHead
            title="Revenue"
            note="Ours. Confirmed payments only, net of refunds — an invoice raised and never paid is not revenue."
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="This month"
              value={formatUsd(business.summary.revenueThisMonthUsd)}
              note="Confirmed, this calendar month"
            />
            <Stat
              label="All time"
              value={formatUsd(business.summary.revenueAllTimeUsd)}
              note={
                business.summary.refundedUsd > 0
                  ? `After ${formatUsd(business.summary.refundedUsd)} refunded`
                  : "Nothing refunded"
              }
            />
            <Stat
              label="MRR"
              value={formatUsd(business.summary.mrrUsd)}
              note="Run rate if nobody leaves. Not cash."
            />
            <Stat
              label="Awaiting payment"
              value={String(business.summary.awaiting)}
              note="Raised, not confirmed. Not revenue."
              muted
            />
          </div>

          {/* The split Victor asked for: what we earn, and what we earn it
              FROM. Both products are $20, so the revenue figures are
              indistinguishable without this. */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <AudienceCard
              title="Traders"
              what="Buy the analysis. No broker account."
              people={business.revenue.traders.people}
              subscribed={business.revenue.traders.subscribed}
              revenueUsd={business.revenue.traders.revenueUsd}
              mrrUsd={business.revenue.traders.mrrUsd}
            />
            <AudienceCard
              title="Investors"
              what="The bot trades their own Vantage account."
              people={business.revenue.investors.people}
              subscribed={business.revenue.investors.subscribed}
              revenueUsd={business.revenue.investors.revenueUsd}
              mrrUsd={business.revenue.investors.mrrUsd}
            />
            {/* NO REVENUE FIGURE, and the card says why. API access comes with
                a subscription and is not priced separately, so any number here
                would either double-count a trader's $20 or invent a price we
                do not charge. */}
            <div className="surface rounded-xl border border-border p-5">
              <p className="text-sm font-medium">Developers</p>
              <p className="mt-1 text-xs text-fg-muted">
                Hold at least one live API key.
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <Row label="People" value={String(business.revenue.developers.people)} />
                <Row
                  label="Live keys"
                  value={String(business.revenue.developers.activeKeys)}
                />
              </dl>
              <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-fg-muted">
                <strong className="font-medium text-fg">Not billed separately.</strong>{" "}
                API access comes with a subscription, so their payments are
                already counted under whichever account type they hold. There is
                no developer revenue figure because there is no developer price.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <SectionHead
              title="Collected"
              note="What we have TAKEN, by rail — not a bank balance. The two drift the moment any of it is spent."
              small
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Total"
                value={formatUsd(business.liquidity.totalUsdCents)}
                small
              />
              <Stat
                label="In naira"
                value={formatNgn(business.liquidity.ngnKobo.amount)}
                small
              />
              <Stat
                label="In USDT"
                value={formatUsdt(business.liquidity.usdtMicro.amount)}
                small
              />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionHead({
  title,
  note,
  small = false,
}: {
  title: string;
  note: string;
  small?: boolean;
}) {
  return (
    <div className="mb-4">
      <h2
        className={small ? "text-sm font-medium" : "text-lg font-semibold"}
      >
        {title}
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-muted">
        {note}
      </p>
    </div>
  );
}

/**
 * One figure.
 *
 * A null `value` means UNKNOWN and renders as a dash, never as zero. "$0.00"
 * and "we cannot read the account" look identical otherwise, and only one of
 * them is a reason to go and look at the VM.
 */
function Stat({
  label,
  value,
  note,
  icon,
  href,
  tone,
  muted = false,
  small = false,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  icon?: React.ReactNode;
  href?: string;
  tone?: "warn";
  muted?: boolean;
  small?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
        {icon ? <span className="text-fg-subtle">{icon}</span> : null}
        {href ? (
          <ArrowUpRight
            className="size-3.5 shrink-0 text-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <p
        className={`mt-2 font-semibold tabular-nums ${
          small ? "text-xl" : "text-2xl sm:text-3xl"
        } ${muted ? "text-fg-muted" : ""}`}
      >
        {value === null ? <span className="text-fg-subtle">—</span> : value}
      </p>
      {note ? (
        <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{note}</p>
      ) : null}
    </>
  );

  const className = `surface rounded-xl border p-5 ${
    tone === "warn" ? "border-accent/40" : "border-border"
  }`;

  return href ? (
    <Link href={href} className={`group block transition-colors hover:border-accent/40 ${className}`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function AudienceCard({
  title,
  what,
  people,
  subscribed,
  revenueUsd,
  mrrUsd,
}: {
  title: string;
  what: string;
  people: number;
  subscribed: number;
  revenueUsd: number;
  mrrUsd: number;
}) {
  return (
    <div className="surface rounded-xl border border-border p-5">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-fg-muted">{what}</p>
      <dl className="mt-4 space-y-2 text-sm">
        <Row label="People" value={String(people)} />
        <Row label="Subscribed" value={String(subscribed)} />
        <Row label="Revenue, all time" value={formatUsd(revenueUsd)} />
        <Row label="MRR" value={formatUsd(mrrUsd)} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-fg-muted">
      {children}
    </p>
  );
}

function winRateOf(totals: {
  wins: number;
  losses: number;
}): string {
  const decided = totals.wins + totals.losses;
  if (decided === 0) return "—";
  return `${((totals.wins / decided) * 100).toFixed(1)}%`;
}

/**
 * How long since the bot last wrote anything, in words — or null while it is
 * current.
 *
 * An hour is the threshold. The bot writes market state every few seconds, so
 * an hour of silence is not a slow cycle, it is something stopped.
 */
function staleness(lastSeenAt: string | null): string | null {
  if (!lastSeenAt) return "as long as we have been watching";
  const minutes = Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 60) return null;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${Math.round(hours / 24)} days`;
}
