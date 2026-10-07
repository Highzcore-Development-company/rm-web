import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Desk } from "@/components/workspace/desk";
import {
  MarketControls,
  TradingSwitch,
  type MarketConfig,
} from "@/components/admin/bot-controls";
import { getAdmin, requirePermission } from "@/lib/admin";
import { getWorkspaceData } from "@/lib/workspace/data";
import { isBotConfigurable } from "@/lib/supabase/rm-server-admin";
import type { BotConfig } from "@/lib/workspace/types";

export const metadata: Metadata = { title: "Bot", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A8 — the admin desk.
 *
 * Live, Activities and History come from the same <Desk> the investor sees,
 * with showChart off. Not a fork: the two must agree about what the bot is
 * doing, and a copy drifts the first time either is touched.
 *
 * The chart is out of scope, so the centre column holds the configuration
 * instead — which is the one thing this page has that the investor desk must
 * never grow.
 */
export default async function AdminBotPage() {
  if (!(await requirePermission("bot.view"))) notFound();

  const t = await getTranslations("adminBot");
  const admin = await getAdmin();
  const data = await getWorkspaceData();

  // Viewing and configuring are separate permissions: support can watch the
  // bot without being able to touch it.
  const canConfigure = admin?.permissions.includes("bot.configure") ?? false;
  const configurable = canConfigure && isBotConfigurable();

  const markets: MarketConfig[] = (data.configs as BotConfig[]).map((c) => ({
    symbol: c.symbol,
    alias: c.alias ?? null,
    lotSize: c.lot_size ?? null,
    closeAtProfit: c.close_at_profit ?? null,
    enabled: c.enabled ?? false,
  }));

  const centre = (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="display text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t("intro")}</p>

      {/* Said plainly rather than leaving an admin to wonder why a control
          does nothing. Two different causes, two different messages. */}
      {!data.connected ? (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("notConnected")}
        </p>
      ) : !configurable ? (
        <p className="mt-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          {t("notConfigured")}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("settings")}
        </h2>
        <div className="mt-3">
          <TradingSwitch
            enabled={data.settings?.trading_enabled ?? false}
            updatedBy={data.settings?.updated_by ?? null}
            configurable={configurable}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("markets")}
        </h2>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-fg-muted">
          {t("lotNote")}
        </p>
        <div className="mt-4">
          <MarketControls markets={markets} configurable={configurable} />
        </div>
      </section>
    </div>
  );

  return (
    <Desk
      markets={data.markets}
      closedTrades={data.closedTrades}
      settings={data.settings}
      connected={data.connected}
      user={{
        name: admin?.email ?? "Admin",
        initials: (admin?.email ?? "A").slice(0, 2).toUpperCase(),
      }}
      showChart={false}
      centre={centre}
      embedded
    />
  );
}
