import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  MarketControls,
  TradingSwitch,
  type MarketConfig,
} from "@/components/admin/bot-controls";
import { getAdmin, requirePermission } from "@/lib/admin";
import { getWorkspaceData } from "@/lib/workspace/data";
import { canWriteToBot, writeBlockedReason } from "@/lib/supabase/rm-server-session";
import type { Quotes } from "@/lib/admin/pip-value";
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
 * AND NO DESK RAIL. It used to render inside <Desk>, which put Market, Pending,
 * Live, History and Performance in a column down the right. Victor, 16 Oct:
 * "take off the side where market, live, history etc is listed. All of them now
 * have their own pages, so those should be happening in their own page not on
 * that tab."
 *
 * He is right that it was duplication — Markets, History and the Chart are
 * real pages now and Performance leads the Overview, so the rail was a second,
 * narrower copy of four screens. The two that had nowhere else to live are
 * Pending and Live, and those are notifications in the navbar now: a count you
 * want to see without navigating does not belong in a panel you have to open a
 * particular page to reach.
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

  // Live prices for the pip line under each lot box. getWorkspaceData already
  // carries them, so this is a reshape rather than a read.
  const quotes: Quotes = {};
  for (const row of data.markets) {
    const pair = (row.alias || row.symbol).toUpperCase().replace(/[^A-Z]/g, "");
    if (pair.length >= 6 && row.price) quotes[pair.slice(0, 6)] = row.price;
  }

  return (
    <div className="max-w-3xl">
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
          {/* NOT `?? false`. A settings row we could not read is not a bot
              that is stopped, and on 22 Oct this card said "The bot is
              stopped" for two hours while it was trading — the select had
              failed. On a kill switch, "unknown" must look like unknown. */}
          <TradingSwitch
            enabled={data.settings ? data.settings.trading_enabled : null}
            configurable={configurable}
            resumeAt={data.settings?.resume_at ?? null}
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
          <MarketControls
            markets={markets}
            configurable={configurable}
            quotes={quotes}
          />
        </div>
      </section>
    </div>
  );
}
