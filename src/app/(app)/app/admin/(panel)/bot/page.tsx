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
import { canWriteToBot, writeBlockedReason } from "@/lib/supabase/rm-server-session";
import type { BotConfig } from "@/lib/workspace/types";

export const metadata: Metadata = { title: "Bot", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Bot controls — the trading switch, and the markets.
 *
 * TWO THINGS, and nothing else. Victor, 16 Oct: "In bot control, is not going
 * to be more than switching off the bot to stop trading and markets settings.
 * anything else should removed."
 *
 * Gone with it:
 *
 *   - THE rm-server SIGN-IN. "I don't need this 'Sign in to the bot to make
 *     changes', because the bot shouldn't have a different login." He is right,
 *     and he had already ruled this way once — see the note on getBotWriteClient.
 *     An admin is an admin; being asked for a second password to use a button
 *     in our own panel is a login nobody should be shown. Writes go through the
 *     rm-server service key, as that ruling intended.
 *   - APPROVAL MODE and the PROPOSAL QUEUE. The bot has not rested a proposal
 *     since --pending came off every launcher on 14 Oct, so the queue could
 *     only ever say "nothing waiting" and the switch only ever armed something
 *     that does not happen. decideProposal() is still in actions.ts if the
 *     feature comes back.
 *
 * The desk still wraps it — Live, History and the market feed on the right are
 * the same component the investor sees, so the two cannot disagree about what
 * the bot is doing.
 */
export default async function AdminBotPage() {
  if (!(await requirePermission("bot.view"))) notFound();

  const t = await getTranslations("adminBot");
  const admin = await getAdmin();
  const data = await getWorkspaceData();

  // Viewing and configuring are still separate permissions: support can watch
  // the bot without being able to touch it. That is a role decision of ours,
  // not a second login — which is the part Victor objected to.
  const canConfigure = admin?.permissions.includes("bot.configure") ?? false;
  const writable = canWriteToBot();
  const configurable = canConfigure && writable;

  const markets: MarketConfig[] = (data.configs as BotConfig[]).map((c) => ({
    symbol: c.symbol,
    alias: c.alias ?? null,
    lotSize: c.lot_size ?? null,
    closeAtProfit: c.close_at_profit ?? null,
    enabled: c.enabled ?? false,
  }));

  const blocked = writeBlockedReason();

  const centre = (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* No visible page title — see the note on the overview page. The h1
          stays screen-reader-only so the document still has a landmark. */}
      <h1 className="sr-only">{t("title")}</h1>

      {/* Said plainly rather than leaving an admin to wonder why a control does
          nothing. Reading and writing fail independently — the panels can be
          full while changes are refused, and the reverse. */}
      {!data.connected ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("notReadable")}
        </p>
      ) : null}

      {/* The one thing worth saying when a control will not work, and it names
          the actual cause — a missing server key — rather than asking somebody
          to log in to something they are already an admin of. */}
      {canConfigure && blocked ? (
        <p className="mb-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm leading-relaxed">
          <strong className="font-medium">Changes cannot be saved yet.</strong>{" "}
          {blocked === "no_url"
            ? "rm-server is not configured — RM_SERVER_SUPABASE_URL is unset."
            : "The rm-server service key is not set on this deployment, so every write would be refused. Add BOT_SUPABASE_SERVICE_ROLE_KEY (the bot project's service_role key) and restart. Nothing else is needed — no separate login."}
        </p>
      ) : null}

      {!canConfigure ? (
        <p className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
          {t("viewOnly")}
        </p>
      ) : null}

      <section>
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
