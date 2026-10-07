"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History as HistoryIcon,
  ListFilter,
  Plus,
  Receipt,
  Send,
  LogOut,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { MarketChart } from "@/components/workspace/market-chart";
import { LogoLink } from "@/components/logo";
import type { BotMarket, BotSettings, BotTrade } from "@/lib/workspace/types";

/**
 * The desk.
 *
 * THE CHART IS THE PAGE. Everything else is a sidebar beside it, because the
 * chart is what someone is actually looking at — the first version of this put
 * Scora in the middle and pushed the chart out entirely, which inverted that.
 *
 *   left    the Scora CHAT, in the rail. Not a button that opens a chat.
 *   centre  the chart. Widest column, and never covered on desktop.
 *   right   Live / Activities / History. Narrow on purpose.
 *
 * Settings and Transactions live in the profile menu, top right.
 *
 * ON MOBILE the chart is what loads. Scora and the feed are off-screen and
 * come over it full-width from the two buttons in the top bar, because at
 * phone width three columns is one column and a guess about which one.
 *
 * The feed renders whether or not a broker account is connected. It shows OUR
 * bot working, which is the argument for connecting one; hiding it until
 * afterwards has the order backwards.
 */

type Tab = "live" | "activities" | "history";

const TABS: { key: Tab; label: string; Icon: typeof Activity }[] = [
  { key: "live", label: "Live", Icon: Activity },
  { key: "activities", label: "Activities", Icon: Sparkles },
  { key: "history", label: "History", Icon: HistoryIcon },
];

const money = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : `${Number(n) < 0 ? "-" : ""}$${Math.abs(Number(n)).toFixed(dp)}`;

const px = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "—" : String(n);

function since(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  // Clamped at zero: the VM's clock runs ahead of this browser's, so a row
  // written "now" can carry a timestamp a second or two in the future and
  // would otherwise render as "-2s".
  const s = Math.max(0, (nowMs - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * A clock that does not exist during SSR.
 *
 * Rendering "11s ago" on the server and "18s ago" in the browser is a
 * hydration mismatch — React regenerates the whole tree and logs an error. Any
 * value derived from Date.now() has this problem; it is not about this
 * component.
 *
 * useSyncExternalStore is the sanctioned way to say "this value is
 * client-only": the server snapshot is null, the client snapshot is the
 * current second, so the first client render matches the server exactly and
 * the time appears on the next tick. It also avoids setState-in-an-effect,
 * which the React Compiler lint correctly objects to.
 */
function useNowMs(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, 1000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );
}

/** Relative time, blank until the browser has a clock. */
function Ago({ iso, suffix = true }: { iso: string | null | undefined; suffix?: boolean }) {
  const now = useNowMs();
  if (now == null) return <span className="opacity-0">00s</span>;
  return <>{since(iso, now)}{suffix ? " ago" : ""}</>;
}

export function Desk({
  markets,
  closedTrades,
  settings,
  connected,
  user,
  showChart = true,
  centre = null,
  embedded = false,
}: {
  markets: BotMarket[];
  closedTrades: BotTrade[];
  settings: BotSettings | null;
  /** rm-server reachable. False means unconfigured, not "the bot did nothing". */
  connected: boolean;
  user: { name: string; initials: string };
  /**
   * A8 renders this same desk without the chart. A prop rather than a fork:
   * the investor desk and the admin desk must show the same Live, Activities
   * and History, and two copies drift the first time one is touched.
   */
  showChart?: boolean;
  /** Dropped into the centre column when the chart is hidden. */
  centre?: ReactNode;
  /**
   * Inside another page's chrome rather than owning the viewport.
   *
   * The admin panel already has a header, a sidebar and branding, so the desk
   * drops its own and takes a bounded height instead of h-dvh. It also drops
   * the Scora rail — the spec puts Scora out of scope for the admin, and an
   * admin is configuring the bot, not asking it questions.
   */
  embedded?: boolean;
}) {
  // Desktop: both rails open. Mobile: both closed over the chart.
  const [scoraOpen, setScoraOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("activities");

  const live = markets.filter((m) => m.state === "active" && m.volume != null);
  // The chart follows whatever the bot is closest to acting on, so the page
  // opens on a market worth looking at rather than alphabetically first.
  const focus =
    live[0]?.symbol ??
    markets.find((m) => m.state === "ready")?.symbol ??
    markets[0]?.symbol ??
    null;

  return (
    <div
      className={
        embedded
          ? "flex min-h-[34rem] flex-col overflow-hidden rounded-xl border border-border bg-bg text-fg lg:h-[calc(100dvh-13rem)] lg:flex-row"
          : "flex h-dvh overflow-hidden bg-bg text-fg"
      }
    >
      {/* ---- left: the Scora CHAT ----
          A drawer over the chart below lg, a column beside it above. */}
      {!embedded && (
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-full flex-col border-r border-border bg-bg transition-transform duration-200 sm:w-[360px] lg:relative lg:z-auto lg:translate-x-0 lg:transition-[width] ${
          scoraOpen ? "translate-x-0" : "-translate-x-full"
        } ${scoraOpen ? "lg:w-[320px] xl:w-[360px]" : "lg:w-0 lg:overflow-hidden lg:border-r-0"}`}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="text-sm font-semibold">Scora</span>
          <button
            type="button"
            onClick={() => setScoraOpen(false)}
            aria-label="Close Scora"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <ScoraChat name={user.name} />
      </aside>
      )}

      {/* ---- centre: the chart ---- */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Dropped when embedded: the admin panel's own header already carries
            the logo and the profile menu, and two of each is a bug. */}
        {!embedded && (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
          <LogoLink width={124} priority />

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedOpen((v) => !v)}
              aria-expanded={feedOpen}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg lg:hidden"
            >
              <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
              Feed
              {live.length > 0 && (
                <span className="rounded bg-brand px-1 text-[10px] font-semibold text-brand-fg">
                  {live.length}
                </span>
              )}
            </button>
            <div className="hidden lg:block">
              <ProfileMenu user={user} />
            </div>
          </div>
        </header>
        )}

        {/* The ported chart, in its full-height "workspace" chrome. Replaced
            by `centre` on the admin desk, where the chart is out of scope and
            the configuration belongs instead. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {showChart ? (
            <MarketChart
              markets={markets.map((m) => ({ symbol: m.symbol, alias: m.alias }))}
              openTrades={live.map((m) => ({ symbol: m.symbol, side: "buy" }))}
              focusSymbol={focus}
              chrome="workspace"
            />
          ) : (
            centre
          )}
        </div>
      </main>

      {/* ---- right: the feed. Narrow — the chart is the focus. ---- */}
      <aside
        className={
          // Embedded, it is a plain column: the mobile toggle that opened the
          // drawer lived in the header this mode drops, so a drawer here could
          // be closed with no way back.
          embedded
            ? "flex min-h-[20rem] w-full shrink-0 flex-col border-t border-border bg-bg lg:w-[320px] lg:border-l lg:border-t-0 xl:w-[360px]"
            : `fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-bg transition-transform duration-200 sm:w-[380px] lg:relative lg:z-auto lg:translate-x-0 lg:transition-[width] ${
                feedOpen ? "translate-x-0" : "translate-x-full"
              } ${feedOpen ? "lg:w-[320px] xl:w-[360px]" : "lg:w-0 lg:overflow-hidden lg:border-l-0"}`
        }
      >
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
          <div role="tablist" aria-label="Bot" className="flex min-w-0 items-center gap-0.5">
            {TABS.map(({ key, label, Icon }) => {
              const on = tab === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                    on ? "bg-brand/15 font-medium text-brand" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {label}
                  {key === "live" && live.length > 0 && (
                    <span className="rounded bg-brand px-1 text-[10px] font-semibold text-brand-fg">
                      {live.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setFeedOpen(false)}
            aria-label="Close feed"
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:text-fg"
          >
            <ChevronRight className="hidden h-4 w-4 lg:block" aria-hidden="true" />
            <X className="h-4 w-4 lg:hidden" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!connected ? (
            <Empty text="rm-server is not configured, so the bot cannot be read from here." />
          ) : tab === "live" ? (
            <LiveTab rows={live} />
          ) : tab === "activities" ? (
            <ActivitiesTab rows={markets} settings={settings} />
          ) : (
            <HistoryTab rows={closedTrades} />
          )}
        </div>
      </aside>

      {/* Edge handles to bring a closed rail back. Deliberately mirrored: the
          same affordance on both sides, so neither panel can be closed with no
          visible way to reopen it. */}
      {!scoraOpen && (
        <button
          type="button"
          onClick={() => setScoraOpen(true)}
          aria-label="Open Scora"
          title="Scora"
          className="fixed left-0 top-20 z-30 flex h-9 w-7 items-center justify-center rounded-r-md border border-l-0 border-border bg-bg text-brand transition-colors hover:bg-surface-hover"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {!feedOpen && (
        <button
          type="button"
          onClick={() => setFeedOpen(true)}
          aria-label="Open feed"
          className="fixed right-0 top-20 z-30 hidden h-8 w-6 items-center justify-center rounded-l-md border border-r-0 border-border bg-bg text-fg-subtle transition-colors hover:text-fg lg:flex"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="px-5 py-10 text-center text-sm leading-relaxed text-fg-subtle">
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ Live */

/**
 * Open positions only. Deliberately not "markets that look interesting" —
 * this tab answers "what is my money in right now", and nothing else belongs
 * in that answer.
 */
function LiveTab({ rows }: { rows: BotMarket[] }) {
  if (!rows.length) {
    return <Empty text="No open trades. The bot is watching; Activities shows what it sees." />;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((m) => {
        const up = (m.pnl ?? 0) >= 0;
        return (
          <li key={m.symbol} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{m.alias}</span>
              <span
                className={`font-mono text-sm font-semibold ${up ? "text-success" : "text-danger"}`}
              >
                {money(m.pnl)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 font-mono text-xs text-fg-subtle">
              <Cell label="lots" value={px(m.volume)} />
              <Cell label="entry" value={px(m.level ?? m.price)} />
              <Cell label="sl" value={px(m.sl)} />
              <Cell label="tp" value={px(m.tp)} />
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              open <Ago iso={m.opened_at} suffix={false} /> · {m.strategy ?? "—"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-fg-subtle">{label}</span>
      <span className="text-fg">{value}</span>
    </span>
  );
}

/* ------------------------------------------------------- Activities */

/**
 * What the bot is doing, per market, right now.
 *
 * This is the tab that earns trust: not a number at the end, but the reasoning
 * as it happens — which markets it is waiting on, what the trend is doing,
 * which strategy that market runs, and how long since it last looked.
 *
 * Sorted by state so the markets closest to a trade sit at the top: active
 * first, then ready, then everything merely being watched.
 */
const STATE_RANK: Record<string, number> = { active: 0, ready: 1, monitoring: 2 };

function ActivitiesTab({
  rows,
  settings,
}: {
  rows: BotMarket[];
  settings: BotSettings | null;
}) {
  if (!rows.length) {
    return <Empty text="The bot has not published any market yet. Its first cycle takes about a minute." />;
  }

  const sorted = [...rows].sort(
    (a, b) =>
      (STATE_RANK[a.state ?? ""] ?? 9) - (STATE_RANK[b.state ?? ""] ?? 9) ||
      a.alias.localeCompare(b.alias),
  );

  return (
    <>
      {settings && !settings.trading_enabled && (
        <p className="border-b border-warning/40 bg-warning/10 px-5 py-2.5 text-xs text-fg">
          Trading is switched off — the bot is watching but will open nothing new.
        </p>
      )}
      <ul className="divide-y divide-border">
        {sorted.map((m) => (
          <li key={m.symbol} className="px-5 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <StateDot state={m.state} />
                <span className="font-semibold">{m.alias}</span>
                <span className="font-mono text-xs text-fg-subtle">{px(m.price)}</span>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                <Ago iso={m.updated_at} />
              </span>
            </div>

            {/* The sentence, not the badge. "Waiting for a pullback on a market
                in a strong downtrend" is what someone actually wants to read. */}
            <p className="mt-1.5 text-sm text-fg-muted">
              {m.reason ?? "—"}
              {m.htf_trend ? ` · ${m.htf} ${m.htf_trend.toLowerCase()}` : ""}
              {m.entry_trend && m.entry_trend !== m.htf_trend
                ? ` · ${m.timeframe} ${m.entry_trend.toLowerCase()}`
                : ""}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip>{m.strategy ?? "no strategy"}</Chip>
              {m.latest_signal && <Chip>{m.latest_signal}</Chip>}
              {m.level != null && <Chip>level {px(m.level)}</Chip>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function StateDot({ state }: { state: string | null }) {
  const cls =
    state === "active"
      ? "bg-success"
      : state === "ready"
        ? "bg-brand"
        : "bg-fg-subtle/40";
  return <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-fg-subtle">
      {children}
    </span>
  );
}

/* --------------------------------------------------------- History */

function HistoryTab({ rows }: { rows: BotTrade[] }) {
  if (!rows.length) {
    return <Empty text="No closed trades yet. A trade appears here once it has been closed." />;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((t) => {
        const up = (t.pnl ?? 0) >= 0;
        return (
          <li key={t.id} className="px-5 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                {t.symbol}
                <span className="ml-2 text-xs font-normal uppercase text-fg-subtle">
                  {t.side}
                </span>
              </span>
              <span
                className={`font-mono text-sm font-semibold ${up ? "text-success" : "text-danger"}`}
              >
                {money(t.pnl)}
              </span>
            </div>
            <p className="mt-1 text-xs text-fg-subtle">
              {px(t.open_price)} → {px(t.close_price)} · {t.close_reason ?? "closed"} ·{" "}
              <Ago iso={t.close_ts} />
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------- Profile */

function ProfileMenu({ user }: { user: { name: string; initials: string } }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    // The session lives in a cookie the server reads, so the cached RSC
    // payload stays signed-in until this runs.
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-fg-muted transition-colors hover:text-fg"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand">
          {user.initials}
        </span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <>
          {/* Click-away. A menu that only closes via its own button is a menu
              people leave open by accident. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="surface-raised absolute right-0 top-10 z-50 w-56 rounded-xl border border-border py-1.5 shadow-elev-2"
          >
            <p className="truncate px-3.5 py-2 text-xs text-fg-subtle">{user.name}</p>
            <div className="my-1 border-t border-border" />
            <MenuLink href="/app/account" Icon={Settings2}>
              Settings
            </MenuLink>
            <MenuLink href="/app/checkout" Icon={Receipt}>
              Transactions
            </MenuLink>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({
  href,
  Icon,
  children,
}: {
  href: string;
  Icon: typeof Settings2;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

/* ----------------------------------------------------------- Scora */

/** Lifted from the ported workspace so the chat is unchanged in place. */
function ScoraChat({ name }: { name: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-fg">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xl font-semibold">Welcome back.</p>
        <p className="mt-0.5 text-xs text-fg-subtle">{name}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand/15 px-2.5 py-1 font-mono text-xs font-semibold text-brand">
          Scora v0.1
        </span>
        <p className="mt-4 text-sm text-fg-muted">What would you like to explore today?</p>

        <div className="mt-6 w-full max-w-sm space-y-2.5">
          {["Analyze my portfolio", "Find a setup"].map((s) => (
            <button
              key={s}
              type="button"
              disabled
              className="w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left text-sm text-fg-muted disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2.5">
          <Plus className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            disabled
            placeholder="Ask Scora…"
            className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none"
          />
          <Send className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        </div>
        {/* Disabled, and it says why. An input that swallows questions in
            silence is worse than one that admits it is not connected. */}
        <p className="mt-2 text-center text-[11px] text-fg-subtle">
          Scora answers once the model is connected. AI can make mistakes. Not financial advice.
        </p>
      </div>
    </div>
  );
}
