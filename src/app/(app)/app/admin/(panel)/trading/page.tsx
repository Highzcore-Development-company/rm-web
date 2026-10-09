import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requirePermission } from "@/lib/admin";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import { tradingPnlFrom } from "@/lib/admin/trading-pnl";
import { Signed } from "@/components/admin/signed";
import type { BotTrade } from "@/lib/workspace/types";

export const metadata: Metadata = { title: "Trading P&L", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Historical trading profit and loss, by date.
 *
 * Its own page, deliberately NOT part of Billing. Billing is company money —
 * subscriptions we charged. This is the master account's trading result, which
 * belongs to the investors mirroring it; the performance fee is configured in
 * Vantage's MAM panel and paid out by Vantage, never through us. Putting the
 * two on one page is how they end up in one total.
 *
 * Gated on bot.view rather than finance.view for the same reason: this is the
 * bot's performance, not the company's accounts.
 */
export default async function AdminTradingPage() {
  if (!(await requirePermission("bot.view"))) notFound();

  const t = await getTranslations("adminTrading");
  const client = createRmServerClient();

  const trades = client
    ? ((
        await client
          .from("bot_trades")
          .select(
            "id, symbol, side, volume, open_ts, close_ts, pnl, commission, swap, close_reason",
          )
          .not("close_ts", "is", null)
          .order("close_ts", { ascending: false })
          .limit(5000)
      ).data ?? []) as BotTrade[]
    : [];

  const pnl = tradingPnlFrom(trades);
  const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <div>
      <h1 className="display text-3xl font-semibold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        {t("intro")}
      </p>

      {/* Said at the top, every time. The single most expensive mistake an
          admin could make with this page is reading it as company income. */}
      <p className="mt-4 max-w-2xl rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-xs leading-relaxed">
        {t("notRevenue")}
      </p>

      {!client ? (
        <p className="mt-8 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("notConnected")}
        </p>
      ) : pnl.trades === 0 ? (
        <p className="mt-8 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("noTrades")}
        </p>
      ) : (
        <>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                {t("net")}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                <Signed value={pnl.net} format={money} />
              </dd>
              <p className="mt-2 text-xs text-fg-muted">{t("netNote")}</p>
            </Card>
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                {t("trades")}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                {pnl.trades}
              </dd>
              <p className="mt-2 text-xs text-fg-muted">
                {t("winLoss", { wins: pnl.wins, losses: pnl.losses })}
              </p>
            </Card>
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                {t("profitFactor")}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums">
                {pnl.profitFactor === null
                  ? t("noLosses")
                  : pnl.profitFactor.toFixed(2)}
              </dd>
            </Card>
            <Card>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">
                {t("bestWorst")}
              </dt>
              <dd className="mt-2 space-y-1 text-sm tabular-nums">
                <div>
                  <Signed value={pnl.best?.net ?? 0} format={money} />{" "}
                  <span className="text-xs text-fg-muted">{pnl.best?.date}</span>
                </div>
                <div>
                  <Signed value={pnl.worst?.net ?? 0} format={money} />{" "}
                  <span className="text-xs text-fg-muted">{pnl.worst?.date}</span>
                </div>
              </dd>
            </Card>
          </dl>

          {pnl.months.map((month) => (
            <section key={month.month} className="mt-10">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{month.month}</h2>
                <p className="text-sm tabular-nums">
                  <Signed value={month.net} format={money} />
                  <span className="ml-2 text-xs text-fg-muted">
                    {t("overTrades", { count: month.trades })}
                  </span>
                </p>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                      <th scope="col" className="py-2 pr-4 font-medium">{t("cols.date")}</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">{t("cols.result")}</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">{t("cols.trades")}</th>
                      <th scope="col" className="py-2 text-right font-medium">{t("cols.wl")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {month.days.map((day) => (
                      <tr key={day.date}>
                        <th scope="row" className="py-2.5 pr-4 font-normal tabular-nums">
                          {day.date}
                        </th>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          <Signed value={day.net} format={money} />
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-fg-muted">
                          {day.trades}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-fg-muted">
                          {day.wins}/{day.losses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
