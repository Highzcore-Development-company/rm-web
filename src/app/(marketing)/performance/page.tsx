import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EquityCurve } from "@/components/performance/equity-curve";
import { Card, Container } from "@/components/ui";
import {
  getEquityCurve,
  getMonthlyReturns,
  getPerformanceSummary,
  getRecentTrades,
  isStale,
  IS_SAMPLE_DATA,
  type MonthlyReturn,
  type PublicTrade,
} from "@/lib/performance";

export const metadata: Metadata = {
  title: "The record",
  description:
    "Every trade the bot has made on the master account, published in full.",
};

function pct(fraction: number, signed = false): string {
  const value = (fraction * 100).toFixed(1);
  return signed && fraction > 0 ? `+${value}%` : `${value}%`;
}

/** A signed figure. The sign is typed out, not left to toFixed, so a loss reads as a loss. */
function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value < 0 ? "−" : "+"}${text}`;
}

/**
 * P2-402 — a headline stat with its definition.
 *
 * The definition is a <details>, not a tooltip: a hover tooltip is unreachable
 * on a phone, and this is the page people read on a phone before deciding
 * whether to trust us with an account.
 */
function Stat({
  label,
  value,
  definition,
}: {
  label: string;
  value: string;
  definition: string;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-fg-muted">
          What this means
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
          {definition}
        </p>
      </details>
    </Card>
  );
}

/**
 * P2-403 — month by month.
 *
 * The sign is in the number, not only in the colour. Measured on the brand
 * palette, green and red separate by ΔE 5.0 under deuteranopia — below the
 * usable floor — so colour here is reinforcement and the text carries the fact.
 */
function MonthlyTable({
  rows,
  labels,
}: {
  rows: MonthlyReturn[];
  labels: { month: string; ret: string };
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
            <th scope="col" className="py-3 pr-4 font-medium">
              {labels.month}
            </th>
            <th scope="col" className="py-3 text-right font-medium">
              {labels.ret}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.month}>
              <th scope="row" className="py-3 pr-4 font-normal tabular-nums">
                {row.month}
              </th>
              <td
                className={`py-3 text-right tabular-nums ${
                  row.ret >= 0 ? "text-chart-up" : "text-chart-down"
                }`}
              >
                <span aria-hidden="true">{row.ret >= 0 ? "▲ " : "▼ "}</span>
                {pct(row.ret, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** P2-404 — anonymised trade history. */
function TradeTable({
  rows,
  labels,
}: {
  rows: PublicTrade[];
  labels: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
            {["market", "side", "duration", "result", "closed"].map((k) => (
              <th
                key={k}
                scope="col"
                className={`py-3 font-medium ${k === "result" ? "text-right" : "pr-4"}`}
              >
                {labels[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t) => (
            <tr key={t.id}>
              <th scope="row" className="py-3 pr-4 font-mono text-xs font-normal">
                {t.market}
              </th>
              <td className="py-3 pr-4 text-fg-muted">
                {t.side === "buy" ? labels.buy : labels.sell}
              </td>
              <td className="py-3 pr-4 tabular-nums text-fg-muted">
                {t.durationHours}h
              </td>
              <td
                className={`py-3 text-right tabular-nums ${
                  (t.resultR ?? t.resultPct) >= 0
                    ? "text-chart-up"
                    : "text-chart-down"
                }`}
              >
                <span aria-hidden="true">
                  {(t.resultR ?? t.resultPct) >= 0 ? "▲ " : "▼ "}
                </span>
                {t.resultR !== null
                  ? `${signed(t.resultR, 1)}R`
                  : `${signed(t.resultPct * 100, 2)}%`}
              </td>
              <td className="py-3 text-fg-muted">
                {new Date(t.closedAt).toLocaleDateString("en-GB")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PerformancePage() {
  const t = await getTranslations("performance");

  const [summary, equity, monthly, trades] = await Promise.all([
    getPerformanceSummary(),
    getEquityCurve(),
    getMonthlyReturns(),
    getRecentTrades(),
  ]);

  const usable = summary !== null && !isStale(summary);

  if (!usable) {
    return (
      <Container className="py-16 sm:py-24">
        <h1 className="display text-4xl font-semibold sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-fg-muted">
          {t("unavailable")}
        </p>
      </Container>
    );
  }

  const stats = [
    ["totalReturn", pct(summary.totalReturn, true)],
    ["maxDrawdown", `−${pct(summary.maxDrawdown)}`],
    ["winRate", pct(summary.winRate)],
    // Null means no losing trade yet; a dash, not a made-up number.
    [
      "profitFactor",
      summary.profitFactor === null ? "—" : summary.profitFactor.toFixed(2),
    ],
    ["tradeCount", String(summary.tradeCount)],
    ["monthsLive", String(summary.monthsLive)],
  ] as const;

  return (
    <Container className="py-16 sm:py-24">
      {IS_SAMPLE_DATA ? (
        <p
          role="alert"
          className="mb-8 rounded-md border border-chart-down/50 bg-chart-down/10 px-4 py-3 text-sm font-medium"
        >
          {t("sampleWarning")}
        </p>
      ) : null}

      <h1 className="display text-4xl font-semibold sm:text-5xl">
        {t("title")}
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-fg-muted">{t("intro")}</p>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">{t("stats.title")}</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map(([key, value]) => (
            <Stat
              key={key}
              label={t(`stats.${key}`)}
              value={value}
              definition={t(`stats.${key}Def`)}
            />
          ))}
        </dl>

        {/* P2-405 — directly beneath the headline figures, not in the footer. */}
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-fg-muted">
          {t("disclosure", {
            trades: summary.tradeCount,
            months: summary.monthsLive,
          })}
        </p>
        {/* The caveat the brief insists accompanies the record wherever it is
            published: demo fills, and a different Vantage entity. */}
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-fg-muted">
          {t("demoCaveat")}
        </p>
      </section>

      {equity ? (
        <section className="mt-16">
          <h2 className="text-xl font-semibold">{t("equity.title")}</h2>
          <div className="mt-6">
            <EquityCurve points={equity} />
          </div>
        </section>
      ) : null}

      {monthly ? (
        <section className="mt-16 max-w-xl">
          <h2 className="text-xl font-semibold">{t("monthly.title")}</h2>
          <p className="mt-2 text-xs text-fg-muted">{t("monthly.note")}</p>
          <div className="mt-6">
            <MonthlyTable
              rows={monthly}
              labels={{ month: t("monthly.month"), ret: t("monthly.ret") }}
            />
          </div>
        </section>
      ) : null}

      {trades ? (
        <section className="mt-16">
          <h2 className="text-xl font-semibold">{t("trades.title")}</h2>
          <p className="mt-2 max-w-2xl text-xs text-fg-muted">
            {t("trades.note")}
          </p>
          <div className="mt-6">
            <TradeTable
              rows={trades}
              labels={{
                market: t("trades.market"),
                side: t("trades.side"),
                duration: t("trades.duration"),
                result: t("trades.result"),
                closed: t("trades.closed"),
                buy: t("trades.buy"),
                sell: t("trades.sell"),
              }}
            />
          </div>
        </section>
      ) : null}
    </Container>
  );
}
