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
import { BotConnect } from "@/components/admin/bot-connect";
import {
  ApprovalMode,
  ProposalQueue,
  type PendingProposal,
} from "@/components/admin/proposal-queue";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import {
  hasBotSession,
  hasServiceAccess,
  isBotReachable,
} from "@/lib/supabase/rm-server-session";
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
  // Three separate conditions, because they fail for different reasons and an
  // admin needs to know which: no permission, rm-server not configured, or
  // configured but this admin has not signed in to it yet.
  // With the key configured there is nothing for an admin to sign in to, so
  // the form is not rendered at all. Asking somebody to log in to a system
  // they are already an admin of is the thing Victor objected to.
  const viaServiceKey = hasServiceAccess();
  const connected = viaServiceKey || (await hasBotSession());
  const configurable = canConfigure && isBotReachable() && connected;

  // Pending proposals. Read with the ordinary read client: deciding one needs
  // the admin's own rm-server session, but seeing the queue does not.
  const reader = createRmServerClient();
  const proposals: PendingProposal[] = reader
    ? (
        (
          await reader
            .from("bot_proposals")
            .select("id, symbol, side, level, sl, tp, rr, created_at")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(50)
        ).data ?? []
      ).map((p) => ({
        id: p.id as string,
        symbol: p.symbol as string,
        side: p.side as string,
        level: p.level as number,
        sl: p.sl as number | null,
        tp: p.tp as number | null,
        rr: p.rr as number | null,
        createdAt: p.created_at as string,
      }))
    : [];

  const markets: MarketConfig[] = (data.configs as BotConfig[]).map((c) => ({
    symbol: c.symbol,
    alias: c.alias ?? null,
    lotSize: c.lot_size ?? null,
    closeAtProfit: c.close_at_profit ?? null,
    enabled: c.enabled ?? false,
  }));

  const centre = (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* No visible page title — see the note on the overview page. The h1
          stays screen-reader-only so the document still has a landmark. */}
      <h1 className="sr-only">{t("title")}</h1>

      {/* Said plainly rather than leaving an admin to wonder why a control
          does nothing. Reading and writing fail independently — the panels can
          be full while changes are refused, and the reverse. */}
      {!data.connected && (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("notReadable")}
        </p>
      )}

      {canConfigure ? (
        viaServiceKey ? null : isBotReachable() ? (
          <div className="mt-6">
            <BotConnect connected={connected} />
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
            {t("notConfigured")}
          </p>
        )
      ) : (
        <p className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("viewOnly")}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("settings")}
        </h2>
        <div className="mt-3">
          <TradingSwitch
            enabled={data.settings?.trading_enabled ?? false}
            configurable={configurable}
          />
        </div>
      </section>

      {/* BEFORE a trade goes live. Placed directly under the settings and
          above the markets, because an unanswered proposal is the only thing
          on this page that is actively waiting on a human. */}
      <section className="mt-10">
        <h2 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("approval.title")}
        </h2>
        <div className="mt-3">
          <ApprovalMode
            required={data.settings?.require_approval ?? false}
            configurable={configurable}
          />
        </div>

        <h3 className="mt-6 text-xs uppercase tracking-wide text-fg-muted">
          {t("proposals.title", { count: proposals.length })}
        </h3>
        <div className="mt-3">
          <ProposalQueue proposals={proposals} configurable={configurable} />
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
