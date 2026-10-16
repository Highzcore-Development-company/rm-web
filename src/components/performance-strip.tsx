import { getTranslations } from "next-intl/server";
import {
  getPerformanceSummary,
  usingSampleData,
  isStale,
  type PerformanceSummary,
} from "@/lib/performance";
import { ButtonLink, Card, Container } from "@/components/ui";

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Stats({ summary }: { summary: PerformanceSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      <Stat label="Total return" value={pct(summary.totalReturn)} />
      <Stat label="Max drawdown" value={`-${pct(summary.maxDrawdown)}`} />
      <Stat label="Win rate" value={pct(summary.winRate)} />
      <Stat label="Trades" value={summary.tradeCount.toLocaleString("en-US")} />
    </dl>
  );
}

/**
 * P2-101 — the live performance strip.
 *
 * Renders a neutral unavailable state rather than a zero or a stale number when
 * the feed cannot be trusted. See lib/performance.ts.
 */
export async function PerformanceStrip() {
  const t = await getTranslations("home.performance");
  // The warning string belongs to the performance page and is read from there
  // rather than copied, so the two surfaces cannot drift into saying different
  // things about the same data.
  const tp = await getTranslations("performance");
  const summary = await getPerformanceSummary();
  const sample = await usingSampleData();
  const usable = summary !== null && !isStale(summary);

  return (
    <section className="border-y border-border bg-surface py-12">
      <Container>
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <h2 className="text-xl font-semibold">{t("title")}</h2>
            <p className="mt-2 text-sm text-fg-muted">{t("body")}</p>
          </div>

          <div className="flex-1 md:max-w-xl">
            {/*
              SAY SO WHEN THE FIGURES ARE INVENTED.
              /performance already carries this banner; the home page did not,
              so the same sample numbers appeared labelled on one surface and
              bare on the other. In development that is the page a stakeholder
              is most likely to be shown, and "18.0% return, 70.8% win rate"
              with no caveat reads as a track record. Gated on NODE_ENV the
              same way the data is, so it cannot reach production — and if it
              ever does appear in production, the banner is the bug report.
            */}
            {sample ? (
              <p
                role="alert"
                className="mb-4 rounded-md border border-chart-down/50 bg-chart-down/10 px-4 py-3 text-sm font-medium"
              >
                {tp("sampleWarning")}
              </p>
            ) : null}

            {usable ? (
              <Stats summary={summary} />
            ) : (
              <Card className="text-sm text-fg-muted">{t("unavailable")}</Card>
            )}
          </div>

          <ButtonLink href="/performance" variant="secondary">
            {t("cta")}
          </ButtonLink>
        </div>

        {/* P2-405 — the disclosure sits with the figures, never only in the footer. */}
        {usable ? (
          <p className="mt-8 max-w-3xl text-xs leading-relaxed text-fg-muted">
            Past performance does not predict future results. This is a record of{" "}
            {summary.tradeCount} trades over {summary.monthsLive} months. Trading
            carries risk of loss.
          </p>
        ) : null}
      </Container>
    </section>
  );
}
