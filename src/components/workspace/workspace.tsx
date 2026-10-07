'use client';

// The workspace — the trading desk in the Highscore AI shell.
//
// This is NOT a second bot. Every number here is the same bot_* data the
// existing dashboard reads: one source, two skins.
//
// Three columns, as designed. The rail chooses what the middle panel shows;
// the chart holds the right-hand side and never goes away, because the answer
// to "why is this trade open" is always on it. Closing the middle panel (✕)
// gives the chart the whole screen — the panel is a companion to the chart,
// not a page that replaces it.
//
// Sections the design calls for and we do not have yet (Scora, Backtests,
// Alerts) say so plainly rather than showing an empty panel that looks broken.

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoLink, LogoMark } from '@/components/logo';
import { deskPath, marketPath, tradePath } from '@/lib/workspace/desk-route';
import { marketSlug } from '@/lib/workspace/market-slug';
import {
  Sparkles, CandlestickChart, ListFilter, Clock, Activity, History as HistoryIcon,
  FlaskConical, Bell, X, ChevronLeft, ChevronRight, Send, Plus, MoreHorizontal, ChevronDown,
  SlidersHorizontal, Minus, Loader2, BarChart3, TrendingUp, Receipt, Settings2, Menu,
  AlertTriangle, FileClock,
} from 'lucide-react';
import { MarketChart } from '@/components/workspace/market-chart';
import { TrendChip, StateBadge, TimeAgo, Duration, Sparkline, useNow } from '@/components/workspace/bot-bits';
import { MarketEnableToggle } from '@/components/workspace/operator-controls';
import { CancelOrderButton } from '@/components/workspace/operator-controls';
import { ProposalActions } from './proposal-actions';
import { TradingSwitchButton } from '@/components/workspace/operator-controls';
import { ApprovalModeToggle } from '@/components/workspace/operator-controls';
import { FlattenAllButton } from '@/components/workspace/operator-controls';
import { setLotSizeAction, setCloseAtProfitAction } from '@/lib/workspace/actions';
import type {
  BotMarket, BotTrade, BotEquity, BotSettings, BotProposal, BotConfig, BotSymbolSpec,
} from '@/lib/workspace/types';

type Section =
  | 'scora' | 'chart' | 'markets' | 'pending' | 'orders' | 'active' | 'history' | 'backtests' | 'alerts'
  | 'performance' | 'transactions' | 'settings';

/** How the desk was left: which section, and what was open. Per browser. */
const DESK_KEY = 'hs-workspace-desk';
/** Layout only. Where you ARE is the URL's job — see lib/ai/desk-route. */
type DeskState = {
  panelOpen: boolean;
  railOpen: boolean;
  panelSide: 'left' | 'right';
};

const TITLES: Record<Section, string> = {
  scora: 'Scora', chart: 'Chart', markets: 'Markets', pending: 'Pending', orders: 'Orders',
  active: 'Active', history: 'History', backtests: 'Backtests', alerts: 'Alerts',
  performance: 'Performance', transactions: 'Transactions', settings: 'Settings',
};

const money = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : `${Number(n) < 0 ? '−' : ''}$${Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const signed = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n) >= 0 ? '+' : ''}${money(n)}`;
const tone = (n: number | null | undefined) =>
  n == null ? 'text-fg-muted' : Number(n) > 0 ? 'text-brand' : Number(n) < 0 ? 'text-danger' : 'text-fg-muted';
const px = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : String(n);

export function Workspace({
  markets, configs, specs, closedTrades, equity, equityCurve, settings, proposals, lastUpdate, user,
  section, openOn = null, openDetails = false, openTicket = null,
}: {
  /* WHERE WE ARE COMES FROM THE URL, not from state.
   *
   * The desk used to hold its own place and mirror it into `?tab=`, which made
   * the address a description of state rather than the thing driving it — so
   * Back did nothing useful and a refresh re-derived the answer. These props
   * are the route, parsed by the page; every click navigates and comes back
   * through here. */
  section: Section;
  /** The market named by `/app/market/<slug>`, already resolved to a symbol. */
  openOn?: string | null;
  /** `/app/market/<slug>/details` — open the market's own screen. A market in
   *  the path WITHOUT this only moves the chart, which is the difference
   *  between looking at something and opening it. */
  openDetails?: boolean;
  /** `/app/trade/<ticket>` — a closed trade opened from History. */
  openTicket?: number | null;
  /** Newest bot_market_state write — the bot's pulse, not the equity snapshot. */
  lastUpdate: string | null;
  markets: BotMarket[];
  configs: BotConfig[];
  specs: BotSymbolSpec[];
  equityCurve: BotEquity[];
  closedTrades: BotTrade[];
  equity: BotEquity | null;
  settings: BotSettings | null;
  proposals: BotProposal[];
  user: { name: string; initials: string };
}) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  // The ... menu offers "Move to right", so the panel is a side, not a column.
  const [panelSide, setPanelSide] = useState<'left' | 'right'>('left');

  /* The desk remembers how you left it.
   *
   * Closing the panel used to last until the next reload, which put the Scora
   * welcome back in the middle of the screen every single time. Restored AFTER
   * mount, never in the state initialisers: localStorage does not exist during
   * SSR, and reading it there makes the server and the browser render
   * different markup. */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(DESK_KEY) || '{}') as Partial<DeskState>;
      // The section is no longer saved here — it is the URL's job now, and two
      // sources for one answer is how they disagree. Only the LAYOUT is
      // remembered: which side the panel is on, and whether it is open.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (typeof s.panelOpen === 'boolean') setPanelOpen(s.panelOpen);
      if (typeof s.railOpen === 'boolean') setRailOpen(s.railOpen);
      if (s.panelSide === 'left' || s.panelSide === 'right') setPanelSide(s.panelSide);
    } catch { /* ignore */ }
    setRestored(true);
  }, []);


  useEffect(() => {
    // Don't write the defaults over the saved state before it is read back.
    if (!restored) return;
    try {
      localStorage.setItem(DESK_KEY, JSON.stringify({ panelOpen, railOpen, panelSide }));
    } catch { /* ignore */ }
  }, [restored, panelOpen, railOpen, panelSide]);

  /* Pull fresh data on a timer.
   *
   * This page is force-dynamic, which makes every LOAD fresh — and then it sat
   * there. A proposal that arrived in Telegram did not appear here until
   * someone pressed reload, which is most of the lag between the alert and the
   * desk. The admin dashboard has done this since BotStatus; the desk never
   * did.
   *
   * Also refreshed on returning to the tab: browsers throttle timers in a
   * background tab, so coming back to a desk frozen ten minutes ago is worse
   * than a slow one — it can show a closed trade as still open. */
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') router.refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [router]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);

  const active = markets.filter((m) => m.state === 'active');
  const ready = markets.filter((m) => m.state === 'ready');
  const resting = ready.filter((m) => m.pending_ticket != null);
  // Pending asks a question; Orders reports one already answered. An approved
  // proposal is not at the broker until the trading loop's next pass, and
  // without somewhere to show that gap, approving appeared to do nothing.
  /* A limit has to rest on the correct side of the market — a buy below price,
   * a sell above it. Once price crosses the level the broker refuses the order,
   * so there is no decision left to make: approving could only come back "too
   * late". The bot retires these within a cycle; until it does they belong with
   * the other outcomes, not in the queue of things wanting an answer. */
  const passedLevel = (p: BotProposal) => {
    const price = markets.find((m) => m.symbol === p.symbol)?.price;
    if (price == null || p.level == null) return false;
    return String(p.side).startsWith('buy') ? price <= p.level : price >= p.level;
  };

  /* ONE AT A TIME PER MARKET. The bot trades one position per symbol, and a
   * proposal stays answerable for three hours — long enough for a position to
   * open on that market in the meantime. Approving then is refused by the bot,
   * so offering it is offering a decision that cannot be carried out. */
  const alreadyTrading = (p: BotProposal) => {
    const m = markets.find((x) => x.symbol === p.symbol);
    return m?.state === 'active' || m?.pending_ticket != null;
  };

  const awaiting = proposals.filter(
    (p) => p.status === 'pending' && !passedLevel(p) && !alreadyTrading(p),
  );
  // Everything with an outcome, or past the point of having one: approved and
  // waiting on the bot, placed at the broker, missed because price left the
  // level, and the pending ones that can no longer be placed. A filter inside
  // Pending — the same list, one stage later.
  const orders = proposals.filter(
    (p) => p.status !== 'pending' || passedLevel(p) || alreadyTrading(p),
  );
  const floating = markets.reduce((s, m) => s + (Number(m.pnl) || 0), 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = closedTrades
    .filter((t) => t.close_ts && t.close_ts.slice(0, 10) === todayKey)
    .reduce((s, t) => s + (Number(t.pnl) || 0), 0);

  // Which market the Markets panel is drilled into. It lives up here, not in
  // the panel, because Pending opens it too: the ⚙ on a pending card is the
  // same control as the one on a market card, and must land on the same screen.
  /* The market in view comes from the route, not from state. Held in a
   * variable rather than useState so a Back or a pasted link is authoritative:
   * state would have to be re-synced to the URL and the two would drift. */
  const marketFocus = openOn;
  // A closed trade is `/app/trade/<ticket>`, so Back leaves it and a link to
  // one opens it.
  const tradeFocus = openTicket == null
    ? null
    : closedTrades.find((t) => t.ticket === openTicket) ?? null;
  const openTrade = (t: BotTrade) => {
    if (t.ticket == null) return;
    setPanelOpen(true);
    router.push(tradePath(t.ticket));
  };

  /* The state INSIDE a section — which sub-tab, which period — lives up here
   * too, for one reason: it has to survive a refresh. Held in the list that
   * owns it, it is gone the moment the page reloads, and "it stays where I
   * left it" would only half work. */
  const [view, setView] = useState<'awaiting' | 'decided'>('awaiting');
  const [range, setRange] = useState('week');

  /* THE PAGE TITLE CARRIES THE PRICE.
   *
   * Set from the client because it moves: a title rendered on the server is
   * the price at the moment the page was built. With the desk in a background
   * tab this is the only place the number is visible at all. */
  useEffect(() => {
    const m = markets.find((x) => x.symbol === marketFocus) ?? null;
    document.title = m && m.price != null
      ? `${m.alias} ${px(m.price)} · Highzcore`
      : `${TITLES[section]} · Highzcore`;
  }, [markets, marketFocus, section]);

  /* On a phone the rail is a drawer, not a column: 232px of navigation beside
   * a chart leaves room for neither. It slides over, and picking a section
   * closes it — at this size the panel it opened IS the answer. */
  const [navOpen, setNavOpen] = useState(false);
  // The drawer is always full width when it slides over, so labels show there
  // even when the desktop rail is collapsed to icons. navOpen is only ever
  // true on mobile — the control that sets it is lg:hidden.
  const railExpanded = railOpen || navOpen;

  // setTradeFocus(null) on ANY navigation. An open trade outranks the section
  // in the panel body, so without this, leaving History for Pending kept the
  // trade on screen under Pending's title — the panel said one thing and
  // showed another.
  /* NAVIGATION IS NAVIGATION. Each of these pushes a path and lets the route
   * come back through props, so Back and a refresh both work by construction
   * rather than by us remembering to mirror state into the address. */
  const open = (s: Section) => {
    setPanelOpen(true);
    setNavOpen(false);
    router.push(deskPath(s));
  };

  /** Point the chart at a market and change the URL to it — WITHOUT opening
   *  its details. Clicking a market card does this; the ⚙ does the one below. */
  const focusMarket = (symbol: string) => {
    const m = markets.find((x) => x.symbol === symbol);
    setPanelOpen(true);
    setNavOpen(false);
    router.push(marketPath(marketSlug(symbol, m?.alias ?? null)));
  };

  /** Open the market's own screen — the deliberate second click. */
  const openMarket = (symbol: string) => {
    const m = markets.find((x) => x.symbol === symbol);
    setPanelOpen(true);
    setNavOpen(false);
    router.push(marketPath(marketSlug(symbol, m?.alias ?? null), true));
  };

  const NAV: { group: string | null; items: { key: Section; label: string; icon: React.ReactNode; count?: number }[] }[] = [
    {
      group: null,
      items: [
        { key: 'scora', label: 'Scora', icon: <Sparkles className="h-4 w-4" /> },
        { key: 'chart', label: 'Chart', icon: <CandlestickChart className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Trading',
      items: [
        { key: 'markets', label: 'Markets', icon: <ListFilter className="h-4 w-4" />, count: markets.length },
        // Counts what can actually FILL: a resting order, or a setup waiting
        // on an answer. A watched level has nothing at the broker, and
        // counting it here read as "an order is live" while the desk was
        // stood down — which is exactly the question it prompted.
        // Pending is monitoring: what is resting at the broker. Watched levels
        // are listed there too but not counted — nothing is at the broker for
        // them, and counting them read as "N orders are live".
        { key: 'pending', label: 'Pending', icon: <Clock className="h-4 w-4" />, count: resting.length },
        // Orders holds the decisions. The badge counts the ones still wanting
        // an answer from YOU; the settled ones are inside, not in the number.
        { key: 'orders', label: 'Orders', icon: <FileClock className="h-4 w-4" />, count: awaiting.length },
        { key: 'active', label: 'Active', icon: <Activity className="h-4 w-4" />, count: active.length },
        { key: 'history', label: 'History', icon: <HistoryIcon className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Research',
      items: [
        { key: 'backtests', label: 'Backtests', icon: <FlaskConical className="h-4 w-4" /> },
        { key: 'alerts', label: 'Alerts', icon: <Bell className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Account',
      items: [
        { key: 'performance', label: 'Performance', icon: <TrendingUp className="h-4 w-4" /> },
        { key: 'transactions', label: 'Transactions', icon: <Receipt className="h-4 w-4" /> },
        { key: 'settings', label: 'Settings', icon: <Settings2 className="h-4 w-4" /> },
      ],
    },
  ];

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Rendered at the top level, not inside Pending: the outcome of a
          decision has to reach you wherever you are on the desk. */}
      <MissedNotice orders={orders} />

      {/* Dismisses the drawer. Mobile only — on a desktop the rail is a column
          and there is nothing to dismiss. */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/60 lg:hidden"
        />
      )}

      {/* ── Rail ─────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-border bg-bg transition-transform duration-200 lg:relative lg:z-auto lg:translate-x-0 lg:bg-transparent lg:transition-[width] ${
          navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${railOpen ? 'w-[232px]' : 'w-[232px] lg:w-[64px]'}`}
      >
        {/* Our mark, not highzcore's "highscore.ai" wordmark, which came
            across with the port. Expanded shows the full logo; collapsed to
            64px shows the mark alone, because a 2000x433 wordmark at that
            width is an unreadable smear. */}
        <div className="flex h-16 items-center px-4">
          {railExpanded ? (
            <LogoLink width={130} priority />
          ) : (
            <Link href="/app/dashboard" aria-label="Highzcore" className="inline-flex">
              <LogoMark size={28} />
            </Link>
          )}
        </div>

        {/* scrollbar-none: eleven items overflow a short window, and Windows
            paints a full-width grey bar for it directly against the chart. The
            list still scrolls; the chrome is what goes. */}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-3">
          {NAV.map((block) => (
            <div key={block.group ?? 'top'}>
              {block.group && railExpanded && (
                <p className="px-3 pb-1.5 pt-5 text-[10px] uppercase tracking-[0.18em] font-bold text-fg-subtle">
                  {block.group}
                </p>
              )}
              {block.group && !railExpanded && <div className="my-3 border-t border-border" />}
              {block.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => open(it.key)}
                  title={railExpanded ? undefined : it.label}
                  className={`group relative mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    section === it.key && panelOpen
                      ? 'bg-brand/15 font-semibold text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand'
                      : 'text-fg-muted hover:bg-brand/10 hover:text-fg'
                  }`}
                >
                  <span
                    className={
                      section === it.key && panelOpen
                        ? 'text-brand'
                        : 'transition-colors group-hover:text-brand'
                    }
                  >
                    {it.icon}
                  </span>
                  {railExpanded && it.label}
                  {railExpanded && it.count != null && it.count > 0 && (
                    <span className="ml-auto font-mono text-xs font-semibold text-brand">{it.count}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Who is at the desk. The design puts a credit meter here; we have no
            credits, and inventing a number on a screen full of real money is
            the one thing this page must not do. Account state instead. */}
        <div className="flex items-center gap-3 border-t border-border p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs font-bold text-fg">
            {user.initials}
          </span>
          {railExpanded && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
              <p className="text-[11px] text-fg-subtle">
                {equity?.is_dry_run ? 'Demo account' : 'Live account'}
                {settings && !settings.trading_enabled && <span className="text-warning"> · trading off</span>}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setRailOpen((v) => !v)}
          title={railOpen ? 'Collapse' : 'Expand'}
          // lg only: a drawer is dismissed by tapping away from it, and
          // collapsing one to icons is not a thing it can be.
          className="absolute -right-3 top-[68px] z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-elevated text-fg-muted hover:text-fg lg:flex"
        >
          {railOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* ── Middle panel ─────────────────────────────────────────────── */}
      {panelOpen && (
        <section
          // Full width on a phone and the chart steps aside; a fixed 420px
          // column beside it left neither of them usable. It used to be
          // `hidden lg:flex`, so a phone had no Markets, Pending or Active at
          // all — the panel simply was not there.
          className={`flex w-full min-w-0 shrink-0 flex-col border-border lg:w-[420px] ${
            panelSide === 'left' ? 'lg:border-r' : 'lg:order-last lg:border-l'
          }`}
        >
          <header className="relative flex h-16 items-center gap-2 px-4 lg:px-5">
            {/* Reaches the rail, which is off-screen at this size. */}
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              className="-ml-1 rounded p-1 text-fg-muted hover:text-brand lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Sparkles className="hidden h-4 w-4 text-brand lg:block" />
            {/* The title names what is on screen. An open trade is not the
                section it was opened from. */}
            <h2 className="text-[15px] font-semibold text-fg">
              {tradeFocus ? `${tradeFocus.symbol} trade` : TITLES[section]}
            </h2>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="Panel options"
              className="ml-auto rounded p-1 text-fg-subtle hover:bg-surface-hover hover:text-fg"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              title="Close — the chart takes the whole screen"
              className="rounded p-1 text-fg-subtle hover:bg-surface-hover hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>

            {menuOpen && (
              <>
                {/* A backdrop, so clicking anywhere else dismisses it. */}
                <button
                  type="button"
                  aria-label="Dismiss menu"
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute right-4 top-14 z-50 w-48 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl">
                  <button
                    type="button"
                    onClick={() => { setPanelSide((sd) => (sd === 'left' ? 'right' : 'left')); setMenuOpen(false); }}
                    className="block w-full border-b border-border px-4 py-3 text-left text-sm text-fg hover:bg-surface-hover"
                  >
                    Move to {panelSide === 'left' ? 'right' : 'left'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPanelOpen(false); setMenuOpen(false); }}
                    className="block w-full px-4 py-3 text-left text-sm text-fg hover:bg-surface-hover"
                  >
                    Close panel
                  </button>
                </div>
              </>
            )}
          </header>

          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
            {/* A trade takes over the panel wherever you opened it from, and
                Back puts the list you came from straight back. */}
            {tradeFocus && (
              <TradeDetail trade={tradeFocus} onBack={() => router.push(deskPath(section))} />
            )}
            {!tradeFocus && section === 'scora' && <ScoraPanel name={user.name} />}
            {!tradeFocus && section === 'chart' && <ChartPanel showGrid={showGrid} onGrid={setShowGrid} />}
            {!tradeFocus && section === 'markets' && (
              <MarketList
                markets={markets}
                configs={configs}
                specs={specs}
                focus={marketFocus}
                details={openDetails}
                onFocus={focusMarket}
                onOpenDetails={openMarket}
                onBack={() => marketFocus && focusMarket(marketFocus)}
              />
            )}
            {!tradeFocus && section === 'orders' && (
              <OrdersList
                awaiting={awaiting}
                proposals={orders}
                allMarkets={markets}
                configs={configs}
                specs={specs}
                tab={view}
                onTab={setView}
                range={range}
                onRange={setRange}
                onOpenMarket={openMarket}
                onFocusChart={focusMarket}
              />
            )}
            {!tradeFocus && section === 'pending' && (
              <PendingList
                markets={ready}
                allMarkets={markets}
                configs={configs}
                specs={specs}
                onOpenMarket={openMarket}
                onFocusChart={focusMarket}
              />
            )}
            {!tradeFocus && section === 'active' && (
              <ActiveList markets={active} configs={configs} specs={specs} onOpenMarket={openMarket} />
            )}
            {!tradeFocus && section === 'history' && (
              <HistoryList
                trades={closedTrades}
                range={range}
                onRange={setRange}
                onOpenTrade={openTrade}
              />
            )}
            {!tradeFocus && section === 'backtests' && (
              <Soon
                title="Backtests"
                body="Running an idea against the stored history is not built yet. The closed trades are the record we do have."
                action={{ label: 'Open History', onClick: () => open('history') }}
              />
            )}
            {!tradeFocus && section === 'alerts' && (
              <Soon
                title="Alerts"
                body="Alerts go to Telegram today. Nothing on this screen is fed by them yet — the bot keeps no record of what it sent."
                action={{ label: 'Open Pending', onClick: () => open('pending') }}
              />
            )}
            {!tradeFocus && section === 'performance' && (
              <PerformancePanel equity={equity} curve={equityCurve} trades={closedTrades} />
            )}
            {!tradeFocus && section === 'transactions' && (
              <TransactionsPanel trades={closedTrades} onOpenTrade={openTrade} />
            )}
            {!tradeFocus && section === 'settings' && <SettingsPanel settings={settings} equity={equity} openCount={active.length} />}
          </div>
        </section>
      )}

      {/* ── Chart ────────────────────────────────────────────────────── */}
      {/* One at a time below lg. Two panes on a 390px screen is two unusable
          panes, and the chart is the one that can wait — you close the panel
          to see it, which is what the ✕ already did. */}
      <div className={`min-w-0 flex-1 flex-col ${panelOpen ? 'hidden lg:flex' : 'flex'}`}>
        <header className="flex h-16 shrink-0 items-center gap-5 overflow-x-auto border-b border-border px-4 lg:px-5">
          {/* Only reachable here when the panel is closed, which is the only
              time this header is on screen on a phone. */}
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 shrink-0 rounded p-1 text-fg-muted hover:text-brand lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          {!panelOpen && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-fg-muted hover:text-fg"
            >
              {TITLES[section]}
            </button>
          )}
          <Figure label="Balance" value={money(equity?.balance)} />
          <Figure label="Equity" value={money(equity?.equity)} />
          <Figure label="Open P&L" value={signed(floating)} valueClass={tone(floating)} />
          <Figure label="Today" value={signed(today)} valueClass={tone(today)} />
          {/* The bot's pulse, NOT the equity snapshot's age.
              bot_equity_snapshots is written only when a position closes
              (trader.py, _reconcile_closed), so on a quiet day it reads hours
              old while the bot is running perfectly — which is exactly how it
              misled us. lastUpdate is the newest bot_market_state write, and
              that happens every cycle. */}
          <span className="ml-auto shrink-0 text-[11px]">
            {lastUpdate
              ? <BotPulse iso={lastUpdate} />
              : <span className="text-fg-subtle">bot has never written</span>}
          </span>
        </header>

        <div className="min-h-0 flex-1">
          <MarketChart
            chrome="workspace"
            markets={markets.map((m) => ({ symbol: m.symbol, alias: m.alias }))}
            showGrid={showGrid}
            focusSymbol={marketFocus}
            // Emerald up, the app's red down, muted text — the same values
            // as the tokens, spelled out because canvas cannot read a CSS
            // custom property.
            palette={{ up: '#12B981', down: '#E5484D', text: '#9AA0A6' }}
            openTrades={active.map((m) => ({
              symbol: m.symbol,
              side: (m.latest_signal ?? '').toUpperCase().startsWith('SELL')
                || (m.latest_signal ?? '').toUpperCase().startsWith('SHORT') ? 'sell' : 'buy',
            }))}
          />
        </div>

        <footer className="flex h-9 shrink-0 items-center gap-4 border-t border-border px-5 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${settings?.trading_enabled ? 'bg-brand' : 'bg-warning'}`} />
            {settings?.trading_enabled ? 'Trading on' : 'Trading off'}
          </span>
          <span className="font-mono">{markets.length} markets · {active.length} open · {ready.length} pending</span>
        </footer>
      </div>
    </div>
  );
}

/* -- Panels ------------------------------------------------------------ */

/**
 * Chart settings, as designed.
 *
 * Grid works. Chart type, volume and support/resistance are drawn and disabled,
 * for two different reasons:
 *
 *   Volume — the data exists. bot_bars stores tick_volume/real_volume and
 *   bar_sync writes them; the chart's query simply selects ts,open,high,low,
 *   close and never asks for them, and there is no histogram series to put
 *   them in. Buildable today.
 *
 *   Support / resistance — the data does not exist here. The bot computes
 *   levels in-process (features/book_features.py) to make its decisions, but
 *   nothing persists them: no column in bot_market_state, no table of its own.
 *   The browser has nothing to read.
 *
 * A switch that lights up and changes nothing is worse than one that admits it
 * is not connected.
 */
function ChartPanel({ showGrid, onGrid }: { showGrid: boolean; onGrid: (v: boolean) => void }) {
  return (
    <div className="px-5 py-4">
      <Row label="Chart type">
        <ChartTypeSelect />
      </Row>

      <Row label="Grid">
        <Toggle on={showGrid} onClick={() => onGrid(!showGrid)} />
      </Row>

      <p className="pb-1 pt-5 text-[10px] uppercase tracking-[0.18em] font-bold text-fg-subtle">Indicators</p>

      <Row label="Volume">
        <Toggle on={false} disabled title="bot_bars has the volume; the chart does not read it yet" />
      </Row>
      <Row label="Support / resistance">
        <Toggle on={false} disabled title="the bot computes levels but never stores them" />
      </Row>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('resize'))}
        className="mt-6 w-full rounded-sm border border-border bg-bg-elevated py-2.5 text-sm text-fg transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand active:border-brand active:bg-brand/20 active:text-brand"
      >
        Reset view
      </button>
    </div>
  );
}

/**
 * Chart type.
 *
 * Deliberately NOT a native <select>. The browser paints an open <option> list
 * with the OS accent — the blue bar — and no CSS reliably repaints it, so the
 * one control on this panel would hover blue on a screen that hovers green.
 * A button + menu is ours to style, and matches the ... menu in the header.
 *
 * Only Candlesticks draws: MarketChart builds a candlestick series and hangs
 * its markers and price lines on it. Line and Area are listed because the
 * design lists them, and disabled because picking one would change nothing.
 */
const CHART_TYPES = [
  { key: 'candles', label: 'Candlesticks', ready: true },
  { key: 'line', label: 'Line', ready: false },
  { key: 'area', label: 'Area', ready: false },
] as const;

function ChartTypeSelect() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<(typeof CHART_TYPES)[number]['key']>('candles');
  const current = CHART_TYPES.find((t) => t.key === value) ?? CHART_TYPES[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex w-[150px] items-center gap-2 rounded-sm border bg-bg-elevated px-3 py-2 text-sm transition-colors ${
          open ? 'border-brand/40 text-fg' : 'border-border text-fg hover:border-brand/40 hover:bg-brand/10'
        }`}
      >
        {current.label}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-colors ${open ? 'text-brand' : 'text-fg-subtle'}`} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Dismiss chart type menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul
            role="listbox"
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-[150px] overflow-hidden rounded-sm border border-border bg-surface-raised py-1 shadow-xl"
          >
            {CHART_TYPES.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={t.key === value}
                  disabled={!t.ready}
                  title={t.ready ? undefined : 'not drawn yet — the chart builds candlesticks'}
                  onClick={() => { setValue(t.key); setOpen(false); }}
                  className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                    t.key === value ? 'bg-brand/15 font-semibold text-brand' : 'text-fg'
                  } ${t.ready ? 'hover:bg-brand/10 hover:text-brand' : 'cursor-not-allowed opacity-45'}`}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4">
      <span className="text-sm text-fg">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, disabled, title }: { on: boolean; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-10 w-10 rounded-sm border text-xs font-semibold transition-colors ${
        on ? 'border-brand/40 bg-brand/15 text-brand' : 'border-border text-fg-subtle'
      } ${disabled ? 'opacity-50' : 'hover:border-brand/40 hover:bg-brand/10 hover:text-brand'}`}
    >
      {on ? 'On' : 'Off'}
    </button>
  );
}

function ScoraPanel({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-fg">
          <Sparkles className="h-5 w-5" />
        </span>
        <p className="mt-5 text-xl font-semibold text-fg">Welcome back.</p>
        <p className="mt-0.5 text-xs text-fg-subtle">{name}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand/15 px-2.5 py-1 font-mono text-xs font-semibold text-brand">
          Scora v0.1 <ChevronDown className="h-3 w-3" />
        </span>
        <p className="mt-4 text-sm text-fg-muted">What would you like to explore today?</p>

        <div className="mt-6 w-full space-y-2.5">
          {['Analyze my portfolio', 'Find a setup'].map((s) => (
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

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2.5">
          <Plus className="h-4 w-4 shrink-0 text-fg-subtle" />
          <input
            disabled
            placeholder="Ask Scora about this chart…"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <Send className="h-4 w-4 shrink-0 text-fg-subtle" />
        </div>
        {/* Disabled, and it says why. An input that swallows questions in
            silence is worse than one that admits it is not connected. */}
        <p className="mt-2 text-center text-[11px] text-fg-subtle">
          Scora answers once Qwen is connected. AI can make mistakes. Not financial advice.
        </p>
      </div>
    </div>
  );
}

/**
 * Markets — a card list that opens one market.
 *
 * Two views in one panel: the list, and the market itself. Drilling in does not
 * navigate, because the chart on the right must not blink while you read the
 * reasons a trade is or is not open.
 */
function MarketList({
  markets, configs, specs, focus, details, onFocus, onOpenDetails, onBack, note,
}: {
  markets: BotMarket[];
  configs: BotConfig[];
  specs: BotSymbolSpec[];
  /** The market in the URL. Highlighted in the list and shown on the chart. */
  focus: string | null;
  /** True only for `/app/market/<slug>/details`.
   *
   *  THIS IS THE FIX: focus used to mean both "show it on the chart" and
   *  "open its screen", so clicking a card to see its candles buried the list
   *  you were reading. Two different things now need two different clicks. */
  details: boolean;
  onFocus: (symbol: string) => void;
  onOpenDetails: (symbol: string) => void;
  onBack: () => void;
  note?: string;
}) {
  const selected = markets.find((m) => m.symbol === focus) ?? null;
  const cfgOf = (symbol: string) => configs.find((c) => c.symbol === symbol);

  if (markets.length === 0) return <Empty>No markets yet.</Empty>;

  // Only with /details. A market in the path on its own moves the chart and
  // leaves this list where it was.
  if (selected && details) {
    return (
      <MarketDetail
        market={selected}
        enabled={cfgOf(selected.symbol)?.enabled ?? true}
        config={cfgOf(selected.symbol)}
        spec={specs.find((s) => s.name === selected.symbol)}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="px-4 pb-6 pt-4">
      {note && <p className="px-1 pb-3 text-[11px] text-fg-subtle">{note}</p>}
      <div className="flex items-center gap-2 px-1 pb-3">
        <h3 className="text-[15px] font-semibold text-fg">Markets</h3>
        <span className="rounded-sm bg-surface-hover px-1.5 py-0.5 font-mono text-[11px] font-bold text-fg-muted">
          {markets.length}
        </span>
      </div>

      <ul className="space-y-2">
        {markets.map((m) => (
          <li
            key={m.symbol}
            className={`group relative rounded-sm border bg-bg-elevated transition-colors ${
              m.symbol === focus ? 'border-brand/60' : 'border-border hover:border-brand/40'
            }`}
          >
            {/* The CARD changes the chart. Only the ⚙ opens the market. */}
            <button
              type="button"
              onClick={() => onFocus(m.symbol)}
              title={`Show ${m.alias} on the chart`}
              className="block w-full rounded-sm px-4 py-3 text-left transition-colors hover:bg-brand/5"
            >
              <div className="flex items-center gap-2">
                {/* Green = the bot is allowed to trade here. Not a trend, not a
                    P&L — the one thing you cannot read off the numbers. */}
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    (cfgOf(m.symbol)?.enabled ?? true) ? 'bg-brand' : 'bg-fg-subtle/40'
                  }`}
                  title={(cfgOf(m.symbol)?.enabled ?? true) ? 'Enabled' : 'Paused'}
                />
                <span className="text-sm font-bold text-fg">{m.alias}</span>
                <span className="ml-auto font-mono text-sm text-fg">{px(m.price)}</span>
                {/* Space held for the ⚙ that sits over this on hover, so the
                    icon can never land on top of the price. */}
                <span className="h-3.5 w-3.5 shrink-0" />
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <TrendChip trend={m.htf_trend} />
                <StateBadge state={m.state} />
                <span className={`ml-auto font-mono text-xs font-bold ${tone(m.pnl)}`}>
                  {m.pnl == null ? '—' : signed(m.pnl)}
                </span>
              </div>
            </button>

            {/* VIEW DETAILS — appears on hover, and is the only way in. Its own
                button, over the card rather than inside it: a button nested in
                a button is invalid HTML, and the card's job is the chart. */}
            <button
              type="button"
              onClick={() => onOpenDetails(m.symbol)}
              title={`${m.alias} details`}
              aria-label={`${m.alias} details`}
              className="absolute right-3 top-3 rounded-sm p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-brand/10 hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One market: what the bot sees, and the settings that change it. */
function MarketDetail({ market, enabled, config, spec, onBack }: {
  market: BotMarket;
  enabled: boolean;
  config: BotConfig | undefined;
  spec: BotSymbolSpec | undefined;
  onBack: () => void;
}) {
  return (
    <div className="px-4 pb-8 pt-4">
      <div className="flex items-center gap-2 px-1 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex items-center gap-1 rounded-sm px-1 py-1 text-sm text-fg-muted transition-colors hover:text-brand"
        >
          <ChevronLeft className="h-4 w-4" />
          Markets
        </button>
        <span className="text-[15px] font-bold text-fg">{market.alias}</span>
        <span className="ml-auto">
          <MarketEnableToggle symbol={market.symbol} enabled={enabled} />
        </span>
      </div>

      <section className="rounded-sm border border-border bg-bg-elevated px-4 py-3">
        <h4 className="pb-1 text-sm font-bold text-fg">What the bot sees</h4>
        <Fact label="Trend (H1)" value={market.htf_trend ?? '—'} />
        <Fact label="Trend (M15)" value={market.entry_trend ?? '—'} />
        <Fact label="State" value={market.state ?? '—'} />
        <Fact label="Reason" value={market.reason ?? '—'} />
        <Fact label="Signal" value={market.latest_signal ?? '—'} />
        {/* NAMED FOR WHAT A TRADER CALLS THEM.
            "Price" used to be the live price and the entry was filed under
            "Level" — a word that exists in the strategy code and nowhere in
            the conversation on the desk. So: Latest is where the market is,
            Price is where we get in. The column that said Level is gone. */}
        <Fact label="Latest" value={px(market.price)} />
        <Fact label="Price" value={px(market.level)} />
        {/* The two numbers that say what the trade actually risks. They were on
            BotMarket all along and simply never rendered, so the panel showed
            an entry with no stop and no target — the half of a setup you cannot
            judge it by. Null while flat and before an order rests. */}
        <Fact label="Stop" value={px(market.sl)} />
        <Fact label="Target" value={px(market.tp)} />
        <Fact label="P&L" value={market.pnl == null ? '—' : signed(market.pnl)} valueClass={tone(market.pnl)} last />
      </section>

      <MarketSettings market={market} enabled={enabled} config={config} spec={spec} />
    </div>
  );
}

/**
 * The three things an admin can change about one market.
 *
 * The switch saves itself the moment it is flipped — it is a safety control,
 * and a safety control that waits for a second click is a trap. Lot size and
 * the profit target are typed, so they wait for Save; until then the button
 * stays grey, which is also how you can tell whether you have unsaved work.
 *
 * Both writes go through the same server actions the admin table uses, so the
 * broker's min/max/step still validates the lot size — what comes back is what
 * the bot will actually trade.
 */
function MarketSettings({ market, enabled, config, spec }: {
  market: BotMarket;
  enabled: boolean;
  config: BotConfig | undefined;
  spec: BotSymbolSpec | undefined;
}) {
  const min = spec?.volume_min ?? 0.01;
  const max = spec?.volume_max ?? null;
  const step = spec?.volume_step ?? 0.01;
  const dp = Math.max(0, (String(step).split('.')[1] ?? '').length);

  const savedLot = config?.lot_size ?? min;
  const savedTarget = config?.close_at_profit ?? null;

  const [lot, setLot] = useState<number>(savedLot);
  const [target, setTarget] = useState<string>(savedTarget == null ? '' : String(savedTarget));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const parsedTarget = target.trim() === '' ? null : Number(target.trim());
  const dirty = lot !== savedLot || parsedTarget !== savedTarget;

  const bump = (dir: 1 | -1) => {
    setSaved(false);
    setLot((v) => {
      const next = Number((v + dir * step).toFixed(dp));
      if (next < min) return min;
      if (max != null && next > max) return max;
      return next;
    });
  };

  const save = () => {
    setErr(null);
    setSaved(false);
    if (parsedTarget != null && (!Number.isFinite(parsedTarget) || parsedTarget <= 0)) {
      setErr('Enter a dollar amount, or leave it blank for off.');
      return;
    }
    start(async () => {
      try {
        const [a, b] = await Promise.all([
          setLotSizeAction(market.symbol, lot),
          setCloseAtProfitAction(market.symbol, parsedTarget),
        ]);
        // The lot action clamps to the broker's step — show what it stored, not
        // what was typed, or the field lies about what will be traded.
        if (a.ok && a.value != null) setLot(a.value);
        if (!a.ok) { setErr(a.error); return; }
        if (!b.ok) { setErr(b.error); return; }
        setSaved(true);
      } catch {
        // Both actions call requireSection('trading-bot'), which THROWS. This
        // workspace has no sign-in yet, so a visitor without an admin session
        // lands here. Say that, rather than letting the rejection surface as a
        // blank error overlay on a page about real money.
        setErr('Not saved — you need to be signed in as an admin to change this market.');
      }
    });
  };

  return (
    <section className="mt-3 rounded-sm border border-border bg-bg-elevated px-4 py-4">
      <h4 className="text-sm font-bold text-fg">Settings</h4>

      <div className="mt-2">
        <MarketEnableToggle symbol={market.symbol} enabled={enabled} />
      </div>
      <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-fg">
        {enabled ? 'Trading enabled' : 'Trading paused'}
      </p>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-fg-subtle">
        When off, no new trades open here. Open positions are still managed.
      </p>

      <hr className="my-4 border-border" />

      <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-fg">Lot size</p>
      <div className="mt-3 flex items-stretch overflow-hidden rounded-sm border border-border">
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={pending || lot <= min}
          aria-label="Smaller lot"
          className="flex w-12 shrink-0 items-center justify-center border-r border-border text-fg transition-colors hover:bg-brand/10 hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="flex flex-1 items-center justify-center py-3 font-mono tabular text-sm font-bold text-fg">
          {lot.toFixed(dp)}
        </span>
        <button
          type="button"
          onClick={() => bump(1)}
          disabled={pending || (max != null && lot >= max)}
          aria-label="Bigger lot"
          className="flex w-12 shrink-0 items-center justify-center border-l border-border text-fg transition-colors hover:bg-brand/10 hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {/* The mock reads "1 pip = $0.10 at this size". Nothing here stores a
          tick value, so that figure would be a guess on a screen about real
          money — the broker's own limits instead, which we do have. */}
      <p className="mt-2 text-center text-[11px] text-fg-subtle">
        Minimum {min}. Steps of {step}{max != null ? `, up to ${max}` : ''}.
      </p>

      <hr className="my-4 border-border" />

      <p className="text-center font-mono text-[11px] uppercase tracking-[0.14em] font-bold text-fg">Close at profit</p>
      <input
        value={target}
        onChange={(e) => { setTarget(e.target.value); setSaved(false); }}
        inputMode="decimal"
        placeholder="off"
        disabled={pending}
        className="mt-3 w-full rounded-sm border border-border bg-bg px-4 py-3 font-mono tabular text-sm font-bold text-fg outline-none transition-colors placeholder:font-normal placeholder:text-fg-subtle hover:border-brand/40 focus:border-brand"
      />
      <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">
        Closes at market once P&amp;L reaches about this. Applies to positions already
        open. Blank means off.
      </p>

      <button
        type="button"
        onClick={save}
        disabled={!dirty || pending}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-sm py-3 text-sm font-semibold transition-colors ${
          dirty && !pending
            ? 'bg-brand text-brand-fg hover:bg-brand-hover'
            : 'cursor-not-allowed bg-surface-hover text-fg-subtle'
        }`}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? 'Saving…' : 'Save changes'}
      </button>

      {err && <p className="mt-2 text-center text-[11px] text-danger">{err}</p>}
      {saved && !dirty && !err && <p className="mt-2 text-center text-[11px] text-brand">Saved.</p>}

      {/* Who set the size that every trade here is placed at (migration 017).
          Last writer, not a history — and silent on markets nobody has
          touched, rather than claiming the defaults were somebody's choice. */}
      {config?.updated_by && (
        <p className="mt-3 text-center text-[11px] text-fg-subtle">
          Last changed by{' '}
          <span className="text-fg">{config.updated_by_name ?? config.updated_by}</span>
          {' · '}<TimeAgo iso={config.updated_at} />
        </p>
      )}

      {/* Only when something is actually resting at the broker. A cancel on a
          market the bot is merely watching would have nothing to cancel, and
          it sits below Save because it is the one control here that ends
          something rather than adjusting it. */}
      {market.pending_ticket != null && (
        <>
          <hr className="my-4 border-border" />
          <p className="pb-3 text-center text-[11px] leading-relaxed text-fg-subtle">
            Order <span className="font-mono text-fg">#{market.pending_ticket}</span> is resting at{' '}
            <span className="font-mono text-fg">{px(market.level)}</span>. Nothing is risked until it
            fills.
          </p>
          <div className="flex justify-center">
            <CancelOrderButton
              symbol={market.symbol}
              alias={market.alias}
              ticket={market.pending_ticket}
              level={market.level}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Fact({ label, value, valueClass = 'text-fg', last }: {
  label: string; value: React.ReactNode; valueClass?: string; last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2.5 ${last ? '' : 'border-b border-border'}`}>
      <span className="text-sm text-fg-muted">{label}</span>
      <span className={`font-mono text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

/**
 * Performance — the account's record, measured on CLOSED trades only.
 *
 * Open positions are excluded on purpose: floating P&L is not a result, and a
 * win rate that counts a trade still running flatters itself.
 */
function PerformancePanel({ equity, curve, trades }: {
  equity: BotEquity | null;
  curve: BotEquity[];
  trades: BotTrade[];
}) {
  const settled = trades.filter((t) => t.pnl != null);
  const wins = settled.filter((t) => Number(t.pnl) > 0);
  const losses = settled.filter((t) => Number(t.pnl) < 0);
  const net = settled.reduce((s, t) => s + Number(t.pnl), 0);
  const grossWin = wins.reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
  const winRate = settled.length ? (wins.length / settled.length) * 100 : null;
  const best = settled.reduce<number | null>((b, t) => (b == null || Number(t.pnl) > b ? Number(t.pnl) : b), null);
  const worst = settled.reduce<number | null>((w, t) => (w == null || Number(t.pnl) < w ? Number(t.pnl) : w), null);
  // Oldest → newest: the query hands them back newest first.
  const points = [...curve].reverse().map((e) => Number(e.equity)).filter(Number.isFinite);

  return (
    <div className="px-4 pb-8 pt-4">
      <section className="rounded-sm border border-border bg-bg-elevated px-4 py-4">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-fg-subtle">Equity</p>
        <p className="mt-1 font-mono text-2xl font-bold text-fg">{money(equity?.equity)}</p>
        <p className="mt-0.5 text-[11px] text-fg-subtle">
          Balance {money(equity?.balance)}
          {equity ? <> · updated <TimeAgo iso={equity.ts} /></> : null}
        </p>
        <div className="mt-3">
          {points.length >= 2
            ? <Sparkline values={points} responsive fill />
            : <p className="text-xs text-fg-subtle">Not enough snapshots to draw a curve yet.</p>}
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Net P&L" value={signed(net)} valueClass={tone(net)} />
        <Stat label="Win rate" value={winRate == null ? '—' : `${winRate.toFixed(0)}%`} />
        <Stat label="Wins" value={String(wins.length)} valueClass="text-brand" />
        <Stat label="Losses" value={String(losses.length)} valueClass="text-danger" />
        <Stat label="Best" value={best == null ? '—' : signed(best)} valueClass={tone(best)} />
        <Stat label="Worst" value={worst == null ? '—' : signed(worst)} valueClass={tone(worst)} />
      </div>

      <section className="mt-3 rounded-sm border border-border bg-bg-elevated px-4 py-3">
        <Fact label="Trades closed" value={String(settled.length)} />
        <Fact label="Gross profit" value={money(grossWin)} valueClass="text-brand" />
        <Fact label="Gross loss" value={money(grossLoss)} valueClass="text-danger" />
        <Fact
          label="Profit factor"
          value={grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? '∞' : '—'}
          last
        />
      </section>

      <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
        Closed trades only — {settled.length} of them. Open positions are left out: floating P&amp;L is
        not a result yet.
      </p>
    </div>
  );
}

function Stat({ label, value, valueClass = 'text-fg' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-sm border border-border bg-bg-elevated px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-fg-subtle">{label}</p>
      <p className={`mt-0.5 font-mono tabular text-sm font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

/**
 * Transactions — the money ledger, which is NOT the History list.
 *
 * History answers "what did the bot do". This answers "what reached the
 * account": gross, then the commission and swap that come off it, then the net
 * the balance actually moved by. Those fees are invisible everywhere else on
 * this screen.
 */
function TransactionsPanel({ trades, onOpenTrade }: {
  trades: BotTrade[];
  onOpenTrade: (t: BotTrade) => void;
}) {
  const shown = trades.filter((t) => t.pnl != null).slice(0, 60);
  if (shown.length === 0) return <Empty>No settled trades yet.</Empty>;

  const fees = shown.reduce((s, t) => s + Number(t.commission ?? 0) + Number(t.swap ?? 0), 0);
  const net = shown.reduce((s, t) => s + Number(t.pnl), 0);

  return (
    <div className="px-4 pb-8 pt-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Net, last 60" value={signed(net)} valueClass={tone(net)} />
        <Stat label="Fees in that" value={money(fees)} valueClass={fees < 0 ? 'text-danger' : 'text-fg'} />
      </div>

      <ul className="mt-3 space-y-2">
        {shown.map((t) => {
          const fee = Number(t.commission ?? 0) + Number(t.swap ?? 0);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpenTrade(t)}
                className="block w-full rounded-sm border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:border-brand/40"
              >
                <div className="flex items-center gap-2">
                  <SideBadge side={t.side === 'sell' ? 'sell' : 'buy'} />
                  <span className="text-sm font-bold text-fg">{t.symbol}</span>
                  <span className={`ml-auto font-mono tabular text-sm font-bold ${tone(t.pnl)}`}>
                    {signed(t.pnl)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px] text-fg-subtle">
                  <span>{t.volume} lots · fees {fee === 0 ? '—' : money(fee)}</span>
                  <span className="ml-auto whitespace-nowrap">{closedAtLabel(t.close_ts)}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Settings — the account-wide switches, as opposed to the per-market ones in
 * Markets. Both switches here are the admin dashboard's own components, so
 * there is exactly one implementation of "turn the bot off" in the codebase.
 */
function SettingsPanel({ settings, equity, openCount }: {
  settings: BotSettings | null; equity: BotEquity | null; openCount: number;
}) {
  if (!settings) return <Empty>No settings row yet.</Empty>;

  return (
    <div className="px-4 pb-8 pt-4">
      <section
        className={`rounded-sm border px-4 py-4 ${
          settings.trading_enabled ? 'border-border bg-bg-elevated' : 'border-warning/40 bg-warning/5'
        }`}
      >
        {/* The heading owns its line. Side by side, "Trading is on" wrapped to
            two lines and the two controls fought for what was left — on a
            420px panel there is no room for a label and two buttons in a row. */}
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${settings.trading_enabled ? 'bg-brand' : 'bg-warning'}`} />
          <h4 className="text-sm font-bold text-fg">
            {settings.trading_enabled ? 'Trading is on' : 'Trading is off'}
          </h4>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
          {settings.trading_enabled
            ? 'The bot opens new trades on any enabled market.'
            : 'No new trades are being opened. Open positions and resting orders are still managed.'}
        </p>
        {/* A switch nobody has confirmed the bot READ is worse than none. */}
        <p className="mt-1 text-[11px] text-fg-subtle">
          {settings.seen_by_bot_at
            ? <>Bot last read this <TimeAgo iso={settings.seen_by_bot_at} /></>
            : 'The bot has never confirmed reading this flag.'}
        </p>
        {/* Together deliberately: one stops NEW risk, the other gets out of
            the risk already carried. They are reached for at the same moment. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TradingSwitchButton
            enabled={settings.trading_enabled}
            updatedAt={settings.updated_at}
            updatedBy={settings.updated_by}
            seenByBotAt={settings.seen_by_bot_at}
          />
          <FlattenAllButton openCount={openCount} />
        </div>
      </section>

      <section className="mt-3 rounded-sm border border-border bg-bg-elevated px-4 py-4">
        <h4 className="text-sm font-bold text-fg">
          {settings.require_approval ? 'Asks before trading' : 'Places its own orders'}
        </h4>
        <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
          {settings.require_approval
            ? 'It proposes setups and waits. Nothing reaches the broker until someone approves it, here or in Telegram.'
            : 'It finds a setup and places the order itself.'}
        </p>
        <div className="mt-3">
          <ApprovalModeToggle required={settings.require_approval} />
        </div>
      </section>

      <section className="mt-3 rounded-sm border border-border bg-bg-elevated px-4 py-3">
        <Fact label="Account" value={equity?.is_dry_run ? 'Demo' : 'Live'} valueClass={equity?.is_dry_run ? 'text-warning' : 'text-fg'} />
        <Fact label="Balance" value={money(equity?.balance)} />
        <Fact label="Equity" value={money(equity?.equity)} />
        {/* The person, falling back to the address they signed in with. */}
        <Fact
          label="Changed by"
          value={settings.updated_by_name ?? settings.updated_by ?? '—'}
          last
        />
      </section>
    </div>
  );
}

/** BUY/SELL pill — solid, because direction is the first thing you read. */
function SideBadge({ side }: { side: 'buy' | 'sell' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
        side === 'buy' ? 'bg-brand text-brand-fg' : 'bg-danger text-white'
      }`}
    >
      {side}
    </span>
  );
}

/** A signal reads `SELL @ 1.32840` — the direction is its first word. */
const sideOf = (signal: string | null | undefined): 'buy' | 'sell' => {
  const s = (signal ?? '').toUpperCase();
  return s.startsWith('SELL') || s.startsWith('SHORT') ? 'sell' : 'buy';
};

/**
 * Pips between price and the level that would trigger.
 *
 * A pip is the fourth decimal on a 5-digit quote and the second on a 3-digit
 * one (JPY) — derived from the broker's own `digits`, never assumed, because
 * guessing it on USDJPY is wrong by a factor of 100.
 */
function pipsAway(price: number | null, level: number | null, digits: number | null, symbol: string): string | null {
  if (price == null || level == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(level)) return null;
  const gap = Math.abs(price - level);

  // A pip is a CURRENCY convention. VOL25 is a synthetic index — quoting its
  // distance as "856 pips" is a number with no meaning attached to it, so
  // anything that is not a six-letter currency pair is quoted in points, in
  // the instrument's own units.
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  const isFx = s.length === 6 && digits != null;
  if (!isFx) {
    return `${gap < 10 ? gap.toFixed(2) : Math.round(gap).toLocaleString('en-US')} away`;
  }

  const pip = digits >= 3 ? 10 ** -(digits - 1) : 10 ** -digits;
  const n = gap / pip;
  if (!Number.isFinite(n)) return null;
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} pips away`;
}

/**
 * Pending — everything that would become a trade, and how far off it is.
 *
 * Two kinds of row share the list: a proposal, which needs a person to approve
 * it, and a resting level the bot is watching on its own. They are the same
 * shape on screen, so the approval one carries a tag — nothing else tells you
 * that one of these is waiting on you.
 */
/**
 * Pending — MONITORING ONLY: orders resting at the broker, and levels the bot
 * is watching. Nothing here needs anything from you.
 *
 * Decisions live in Orders. They used to share this list, and they look alike
 * — same card, same symbol, same distance to the level — with only a small
 * badge between "approve this or nothing happens" and "there is nothing to do".
 * Splitting them means a glance at Pending is never mistaken for a to-do list.
 */
function PendingList({ markets, allMarkets, configs, specs, onOpenMarket, onFocusChart }: {
  markets: BotMarket[];
  allMarkets: BotMarket[];
  configs: BotConfig[];
  specs: BotSymbolSpec[];
  /** Opens this market's own screen — the deliberate "Details" click. */
  onOpenMarket: (symbol: string) => void;
  /** Points the chart at this market and stays put. */
  onFocusChart: (symbol: string) => void;
}) {
  if (markets.length === 0) {
    return <Empty>Nothing resting and nothing being watched.</Empty>;
  }

  const specOf = (symbol: string) => specs.find((s) => s.name === symbol);
  const lotOf = (symbol: string) =>
    configs.find((c) => c.symbol === symbol)?.lot_size ?? specOf(symbol)?.volume_min ?? null;
  const priceOf = (symbol: string) => allMarkets.find((m) => m.symbol === symbol)?.price ?? null;

  // Resting orders first: one can fill, the other is only being watched, and
  // the one that can fill is the one worth seeing without scrolling.
  const rows = [...markets]
    .sort((a, b) => Number(b.pending_ticket != null) - Number(a.pending_ticket != null))
    .map((m) => ({
      key: `m:${m.symbol}`,
      symbol: m.symbol,
      label: m.alias,
      side: sideOf(m.latest_signal),
      level: m.level,
      needsApproval: false,
      // A resting ORDER and a watched level look identical until you say which
      // is which. Only the first can fill — and only the first can be
      // cancelled, which is why the ticket is carried through.
      ticket: m.pending_ticket ?? null,
      alias: m.alias,
      proposalId: null as string | null,
      barTime: null as string | null,
      note: m.pending_ticket ? <span className="font-mono">#{m.pending_ticket}</span> : <>watching</>,
    }));

  return (
    <ul className="space-y-2 px-4 pb-6 pt-4">
      {rows.map((r) => {
        const lot = lotOf(r.symbol);
        const pips = pipsAway(priceOf(r.symbol), r.level, specOf(r.symbol)?.digits ?? null, r.symbol);
        return (
          <li
            key={r.key}
            className="group rounded-sm border border-border bg-bg-elevated transition-colors hover:border-brand/40"
          >
            {/* TAPPING THE CARD MOVES THE CHART. It does not navigate: you are
                deciding on this setup, and being thrown into Markets loses the
                list you were working through. The chart is the evidence, so
                the chart is what follows the tap.

                Details are a separate, deliberate click — the ⚙ below. */}
            <button
              type="button"
              onClick={() => onFocusChart(r.symbol)}
              title={`Show ${r.label} on the chart`}
              className="block w-full px-4 py-3 text-left"
            >
            <div className="flex items-center gap-2">
              <SideBadge side={r.side} />
              <span className="text-sm font-bold text-fg">{r.label}</span>
              {/* Three different things share this list and only two of them
                  can fill. The rail's badge counts the fillable ones, so
                  without this tag the card and the badge look like they
                  disagree — a watched level reads as a live order. */}
              {r.needsApproval ? (
                <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                  Needs approval
                </span>
              ) : r.ticket ? (
                <span className="rounded-sm bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand">
                  #{r.ticket}
                </span>
              ) : (
                <span className="rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
                  Watching
                </span>
              )}
              <span className="ml-auto font-mono tabular text-sm font-bold text-fg">
                {lot == null ? '—' : lot.toFixed(2)}
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-subtle">
              <span className="font-mono">Triggers at {px(r.level)}</span>
              <span className="ml-auto whitespace-nowrap font-mono">{pips ?? r.note}</span>
            </div>
            </button>

            {/* The answer, INSIDE the same card as the question — it used to be
                a second bordered box floating underneath, which read as an
                unrelated control that happened to sit below.

                It is only here. The Telegram alert lost its approve button: a
                tap in a chat is attributable to a chat account at best, and
                "who approved this trade" has to be answerable by name weeks
                later. */}
            {r.proposalId && (
              <div className="border-t border-border px-4 pb-3 pt-2.5">
                <ProposalActions
                  id={r.proposalId}
                  level={r.level}
                  price={priceOf(r.symbol)}
                  barTime={r.barTime}
                  side={r.side}
                />
              </div>
            )}

            {/* Details, on purpose rather than by accident. */}
            <div className="flex justify-end border-t border-border px-2 py-1">
              <button
                type="button"
                onClick={() => onOpenMarket(r.symbol)}
                className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] text-fg-subtle transition-colors hover:bg-brand/10 hover:text-brand"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Details
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Orders — decided, and not yet history.
 *
 * The gap this fills: approving a setup writes `approved` to the row, and the
 * order is placed by the trading loop on its next pass, which can be half a
 * minute away. With nowhere to show that, the card simply vanished from
 * Pending and nothing acknowledged the decision — approving looked like it had
 * failed.
 *
 * A row leaves this list when the loop settles it: `placed` with a ticket (it
 * appears in Pending as a resting order), or `missed` if price reached the
 * level first. Both are outcomes worth waiting to see.
 */
function OrdersList({
  awaiting, proposals, allMarkets, configs, specs,
  tab, onTab, range, onRange, onOpenMarket, onFocusChart,
}: {
  /** Needs a decision from you. Listed first, because it is the only thing
   *  here that does. */
  awaiting: BotProposal[];
  /** Already decided, or past deciding. */
  proposals: BotProposal[];
  allMarkets: BotMarket[];
  configs: BotConfig[];
  specs: BotSymbolSpec[];
  /** Owned by the workspace, so the URL can carry them and a refresh keeps
   *  not just the section but what you had filtered inside it. */
  tab: string;
  onTab: (v: 'awaiting' | 'decided') => void;
  range: string;
  onRange: (v: string) => void;
  onOpenMarket: (symbol: string) => void;
  onFocusChart: (symbol: string) => void;
}) {
  // Why a still-pending row is in here rather than awaiting an answer.
  const blockedReason = (p: BotProposal) => {
    const m = allMarkets.find((x) => x.symbol === p.symbol);
    if (m?.state === 'active') return 'A position is already open on this market — the bot trades one at a time, so this cannot be placed.';
    if (m?.pending_ticket != null) return 'An order is already resting on this market, so this cannot be placed.';
    return 'Price has moved through this level, so the broker would refuse it. The bot removes it within a cycle — nothing is at risk.';
  };
  // Same ranges as History, for the same reason: "what did I decide today" is
  // a different question from "what have I decided this month".
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const cutoff = (() => {
    if (days == null) return null;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d.getTime();
  })();

  const shown = proposals.filter((p) => {
    // Still live, in one direction or another: waiting on the bot, or waiting
    // to be retired. Either belongs in every range, whatever its bar time.
    if (p.status === 'approved' || p.status === 'pending') return true;
    if (cutoff == null) return true;
    const when = p.decided_at ?? p.created_at;
    return !!when && new Date(when).getTime() >= cutoff;
  });

  const priceOf = (s: string) => allMarkets.find((m) => m.symbol === s)?.price ?? null;
  const digitsOf = (s: string) => specs.find((x) => x.name === s)?.digits ?? null;

  const tabs = (
    <div className="flex items-center gap-1.5 border-b border-border px-4 py-2">
      {([
        { key: 'awaiting' as const, label: 'Awaiting you', count: awaiting.length },
        { key: 'decided' as const, label: 'Decided', count: shown.length },
      ]).map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onTab(t.key)}
          className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
            tab === t.key
              ? 'border border-brand font-semibold text-brand'
              : 'border border-transparent text-fg-muted hover:bg-brand/10 hover:text-brand'
          }`}
        >
          {t.label}
          {t.count > 0 && <span className="ml-1.5 font-mono text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );

  // Ranges belong to Decided only: something waiting on you belongs in every
  // range, whatever its bar time says.
  const ranges = (
    <div className="scrollbar-none flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-2">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onRange(r.key)}
          className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
            range === r.key
              ? 'bg-brand/15 font-semibold text-brand'
              : 'text-fg-subtle hover:bg-brand/10 hover:text-brand'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  const lotOf = (symbol: string) =>
    configs.find((c) => c.symbol === symbol)?.lot_size
    ?? specs.find((s) => s.name === symbol)?.volume_min
    ?? null;

  // The decisions you owe, with the buttons on them.
  const approvals = (
    <ul className="space-y-2 px-4 pb-6 pt-4">
      {awaiting.map((p) => {
        const label = p.alias ?? p.symbol;
        const lot = lotOf(p.symbol);
        return (
          <li
            key={`a:${p.id}`}
            className="rounded-sm border border-warning/40 bg-bg-elevated transition-colors hover:border-brand/40"
          >
            <button
              type="button"
              onClick={() => onFocusChart(p.symbol)}
              title={`Show ${label} on the chart`}
              className="block w-full px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <SideBadge side={sideOf(p.side)} />
                <span className="text-sm font-bold text-fg">{label}</span>
                <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                  Needs approval
                </span>
                <span className="ml-auto font-mono tabular text-sm font-bold text-fg">
                  {lot == null ? '—' : lot.toFixed(2)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-subtle">
                <span className="font-mono">Triggers at {px(p.level)}</span>
                <span className="ml-auto whitespace-nowrap font-mono">
                  {pipsAway(priceOf(p.symbol), p.level, digitsOf(p.symbol), p.symbol) ?? '—'}
                </span>
              </div>
            </button>

            <div className="border-t border-border px-4 pb-3 pt-2.5">
              <ProposalActions
                id={p.id}
                level={p.level}
                price={priceOf(p.symbol)}
                barTime={p.bar_time}
                side={sideOf(p.side)}
              />
            </div>

            <div className="flex justify-end border-t border-border px-2 py-1">
              <button
                type="button"
                onClick={() => onOpenMarket(p.symbol)}
                className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] text-fg-subtle transition-colors hover:bg-brand/10 hover:text-brand"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Details
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (tab === 'awaiting') {
    return (
      <>
        {tabs}
        {awaiting.length === 0
          ? <Empty>Nothing waiting on you. Setups needing a decision appear here.</Empty>
          : approvals}
      </>
    );
  }

  if (shown.length === 0) {
    return (
      <>
        {tabs}
        {ranges}
        <Empty>
          {proposals.length === 0
            ? 'Nothing decided yet. Approved setups appear here until the bot places them.'
            : 'Nothing decided in this period.'}
        </Empty>
      </>
    );
  }

  return (
    <>
    {tabs}
    {ranges}
    <ul className="space-y-2 px-4 pb-6 pt-4">
      {shown.map((p) => {
        const label = p.alias ?? p.symbol;
        return (
          <li
            key={p.id}
            className="rounded-sm border border-border bg-bg-elevated transition-colors hover:border-brand/40"
          >
            <button
              type="button"
              onClick={() => onFocusChart(p.symbol)}
              title={`Show ${label} on the chart`}
              className="block w-full px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <SideBadge side={sideOf(p.side)} />
                <span className="text-sm font-bold text-fg">{label}</span>
                <OrderStatusBadge status={p.status} ticket={p.ticket ?? null} />
                <span className="ml-auto font-mono tabular text-sm font-bold text-fg">
                  {p.rr == null ? '—' : `${p.rr.toFixed(2)} R`}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-subtle">
                <span className="font-mono">Triggers at {px(p.level)}</span>
                <span className="ml-auto whitespace-nowrap font-mono">
                  {pipsAway(priceOf(p.symbol), p.level, digitsOf(p.symbol), p.symbol) ?? '—'}
                </span>
              </div>

              <p className="mt-1.5 text-[11px] leading-relaxed text-fg-subtle">
                {/* What happened to it, plainly. `missed` is the one that most
                    needs saying: approved, and then nothing was placed. */}
                {p.status === 'approved' && 'Waiting for the bot to place it'}
                {p.status === 'placed' && 'Resting at the broker'}
                {p.status === 'missed' && (
                  <span className="text-warning">
                    {p.note || 'Price had left the level — nothing was placed'}
                  </span>
                )}
                {p.status === 'pending' && (
                  <span className="text-warning">{blockedReason(p)}</span>
                )}
                {p.decided_by ? <> · by <span className="text-fg">{p.decided_by}</span></> : null}
                {p.decided_at ? <> <TimeAgo iso={p.decided_at} /></> : null}
              </p>
            </button>

            <div className="flex justify-end border-t border-border px-2 py-1">
              <button
                type="button"
                onClick={() => onOpenMarket(p.symbol)}
                className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] text-fg-subtle transition-colors hover:bg-brand/10 hover:text-brand"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Details
              </button>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

/**
 * "You approved it, and it did not get placed."
 *
 * The outcome the desk had no way of telling you. Approving succeeds, the bot
 * then tries to place and finds price has left the level, and the only mention
 * of it was a Telegram message. On the screen the card simply vanished.
 *
 * Driven by the desk's own polling: a proposal that turns up `missed` within
 * the last quarter hour, and has not already been acknowledged here. Dismissals
 * are remembered per browser so the same failure does not reappear on every
 * refresh for the rest of the day.
 */
const MISSED_SEEN_KEY = 'hs-missed-acked';
const MISSED_WINDOW_MS = 15 * 60_000;

function MissedNotice({ orders }: { orders: BotProposal[] }) {
  // null = not read yet. Rendering nothing until it loads keeps the first
  // paint identical on the server and the client.
  const [acked, setAcked] = useState<string[] | null>(null);
  // Above the early return, and a ticking value rather than Date.now() in
  // render: reading the wall clock while rendering makes the output depend on
  // when React happened to paint.
  const now = useNow(30_000);
  useEffect(() => {
    let stored: string[] = [];
    try { stored = JSON.parse(localStorage.getItem(MISSED_SEEN_KEY) || '[]') as string[]; }
    catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAcked(stored);
  }, []);

  if (acked == null) return null;

  const fresh = orders.filter((p) => {
    if (p.status !== 'missed') return false;
    if (acked.includes(p.id)) return false;
    const when = p.decided_at ?? p.created_at;
    return !!when && now - new Date(when).getTime() <= MISSED_WINDOW_MS;
  });
  if (fresh.length === 0) return null;

  const dismiss = () => {
    // Keep the list bounded — the last 50 acknowledgements is plenty to stop
    // a repeat, and this lives in localStorage.
    const next = [...acked, ...fresh.map((p) => p.id)].slice(-50);
    setAcked(next);
    try { localStorage.setItem(MISSED_SEEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div className="relative w-full max-w-[420px] rounded-sm border border-warning/40 bg-bg-elevated p-5 shadow-xl">
        <p className="flex items-center gap-2 text-sm font-bold text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fresh.length === 1 ? 'Approved, but not placed' : `${fresh.length} approvals were not placed`}
        </p>

        <ul className="mt-3 space-y-2">
          {fresh.map((p) => (
            <li key={p.id} className="rounded-sm border border-border bg-bg px-3 py-2">
              <div className="flex items-center gap-2">
                <SideBadge side={sideOf(p.side)} />
                <span className="text-sm font-bold text-fg">{p.alias ?? p.symbol}</span>
                <span className="ml-auto font-mono text-xs text-fg-muted">{px(p.level)}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">
                {p.note || 'Price had left the level by the time the bot went to place it.'}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
          Nothing reached the broker and nothing is at risk. The bot will offer the
          setup again if it comes back on the right side of the level.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded-sm bg-surface-hover py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-brand/15 hover:text-brand"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/**
 * One closed trade, in full.
 *
 * Tapping a History card used to be an <a href="/trade/123">, and on this host
 * the proxy redirects that to /app?ticket=123 — so it navigated the desk to
 * itself, moved the chart, and looked like nothing had happened. The trade's
 * own story had no home here.
 *
 * Everything below is already in the row the list was built from; no extra
 * query. What it deliberately leads with is MAE: "came within a hair of the
 * stop" is the story a green P&L hides.
 */
function TradeDetail({ trade, onBack }: { trade: BotTrade; onBack: () => void }) {
  const t = trade;
  const fee = Number(t.commission ?? 0) + Number(t.swap ?? 0);

  return (
    <div className="px-4 pb-8 pt-4">
      <div className="flex items-center gap-2 px-1 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex items-center gap-1 rounded-sm px-1 py-1 text-sm text-fg-muted transition-colors hover:text-brand"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <SideBadge side={t.side === 'sell' ? 'sell' : 'buy'} />
        <span className="text-[15px] font-bold text-fg">{t.symbol}</span>
        <span className={`ml-auto font-mono tabular text-sm font-bold ${tone(t.pnl)}`}>
          {signed(t.pnl)}
        </span>
      </div>

      <section className="rounded-sm border border-border bg-bg-elevated px-4 py-3">
        <h4 className="pb-1 text-sm font-bold text-fg">The trade</h4>
        <Fact label="Entry" value={px(t.open_price)} />
        <Fact label="Exit" value={px(t.close_price)} />
        <Fact label="Size" value={`${t.volume} lots`} />
        <Fact label="Stop" value={px(t.sl)} />
        <Fact label="Target" value={px(t.tp)} />
        <Fact label="Closed because" value={closeReasonLabel(t.close_reason)} />
        <Fact label="Opened" value={closedAtLabel(t.open_ts)} />
        <Fact label="Closed" value={closedAtLabel(t.close_ts)} last />
      </section>

      <section className="mt-3 rounded-sm border border-border bg-bg-elevated px-4 py-3">
        <h4 className="pb-1 text-sm font-bold text-fg">The money</h4>
        <Fact label="Net P&L" value={signed(t.pnl)} valueClass={tone(t.pnl)} />
        <Fact label="Commission" value={t.commission == null ? '—' : money(t.commission)} />
        <Fact label="Swap" value={t.swap == null ? '—' : money(t.swap)} />
        <Fact label="Fees total" value={fee === 0 ? '—' : money(fee)} />
        <Fact
          label="R multiple"
          value={t.r_multiple == null ? '—' : `${t.r_multiple.toFixed(2)} R`}
          valueClass={t.r_multiple == null ? 'text-fg' : tone(t.r_multiple)}
          last
        />
      </section>

      <section className="mt-3 rounded-sm border border-border bg-bg-elevated px-4 py-3">
        <h4 className="pb-1 text-sm font-bold text-fg">How it ran</h4>
        {/* In price units, measured on bar extremes — mae is how close it came
            to the stop, which the P&L column cannot tell you. */}
        <Fact label="Best in favour" value={t.mfe == null ? '—' : px(t.mfe)} valueClass="text-brand" />
        <Fact label="Worst against" value={t.mae == null ? '—' : px(t.mae)} valueClass="text-danger" />
        <Fact label="Entry spread" value={t.entry_spread == null ? '—' : px(t.entry_spread)} />
        <Fact label="With the trend?" value={t.trend_agreement ?? '—'} />
        <Fact label="Strategy" value={t.strategy ?? '—'} />
        <Fact label="Timeframe" value={t.timeframe ?? '—'} last />
      </section>

      {t.ticket != null && (
        <p className="mt-3 text-center font-mono text-[11px] text-fg-subtle">
          Ticket #{t.ticket}
          {t.is_dry_run && <span className="text-warning"> · demo</span>}
        </p>
      )}
    </div>
  );
}

/** Where a decided proposal got to. Green = at the broker, amber = it didn't. */
function OrderStatusBadge({ status, ticket }: { status: string; ticket: number | null }) {
  const s = status === 'placed'
    ? { cls: 'bg-brand/15 text-brand', label: ticket ? `#${ticket}` : 'Placed' }
    : status === 'missed'
      ? { cls: 'bg-warning/15 text-warning', label: 'Not placed' }
      // Still 'pending' in the table, but price has crossed the level, so it
      // is unanswerable rather than unanswered.
      : status === 'pending'
        ? { cls: 'bg-warning/15 text-warning', label: 'Not placeable' }
        : { cls: 'bg-brand/15 text-brand', label: 'Approved' };
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
}

/**
 * Active — what is open, and how far it has travelled.
 *
 * The bar along the bottom is entry → target, filled by where price is now and
 * coloured by the P&L. It is drawn ONLY when there is a real entry and a real
 * target to measure between; a bar with a guessed denominator would be a
 * picture of nothing on a screen about open money.
 */
function ActiveList({ markets, configs, specs, onOpenMarket }: {
  markets: BotMarket[];
  configs: BotConfig[];
  specs: BotSymbolSpec[];
  onOpenMarket: (symbol: string) => void;
}) {
  if (markets.length === 0) return <Empty>Nothing open.</Empty>;

  const lotOf = (m: BotMarket) =>
    m.volume
    ?? configs.find((c) => c.symbol === m.symbol)?.lot_size
    ?? specs.find((s) => s.name === m.symbol)?.volume_min
    ?? null;

  return (
    <ul className="space-y-2 px-4 pb-6 pt-4">
      {markets.map((m) => {
        const side = sideOf(m.latest_signal);
        const lot = lotOf(m);
        const entry = m.level;
        const span = entry != null && m.tp != null ? Math.abs(m.tp - entry) : null;
        const travelled = entry != null && m.price != null ? Math.abs(m.price - entry) : null;
        const progress = span != null && span > 0 && travelled != null
          ? Math.max(0, Math.min(1, travelled / span))
          : null;

        return (
          <li key={m.symbol}>
            <button
              type="button"
              onClick={() => onOpenMarket(m.symbol)}
              title={`Open ${m.alias}`}
              className="group relative block w-full overflow-hidden rounded-sm border border-border bg-bg-elevated px-4 pb-4 pt-3 text-left transition-colors hover:border-brand/40 hover:bg-brand/5"
            >
            <div className="flex items-center gap-2">
              <SideBadge side={side} />
              <span className="text-sm font-bold text-fg">{m.alias}</span>
              <span className={`ml-auto font-mono tabular text-sm font-bold ${tone(m.pnl)}`}>
                {signed(m.pnl)}
              </span>
              <SlidersHorizontal
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>

            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-subtle">
              <span className="font-mono">
                Entry {px(entry)}{lot == null ? '' : ` · ${lot.toFixed(2)} lots`}
              </span>
              <span className="ml-auto whitespace-nowrap font-mono">
                {m.opened_at ? <Duration from={m.opened_at} /> : '—'}
              </span>
            </div>

            {progress != null && (
              <span
                aria-hidden
                title={`${Math.round(progress * 100)}% of the way from entry to target`}
                className={`absolute bottom-0 left-0 h-1 transition-[width] ${
                  Number(m.pnl) < 0 ? 'bg-danger' : 'bg-brand'
                }`}
                style={{ width: `${progress * 100}%` }}
              />
            )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The bot's own close_reason codes (live/trader.py), in an admin's words. */
const CLOSE_REASON: Record<string, string> = {
  take_profit: 'Take profit',
  stop_loss: 'Stop loss',
  profit_locked: 'Profit locked',
  close_at_profit: 'Profit target',
  manual_close: 'Manual',
  admin_close: 'Manual',
  bot_close: 'Bot close',
  stop_out: 'Stop out',
  rollover: 'Rollover',
  reconciled_stale: 'Reconciled',
  reconciled_closed: 'Reconciled',
  closed: 'Closed',
};

const closeReasonLabel = (raw: string | null) => {
  if (!raw) return 'Closed';
  return CLOSE_REASON[raw] ?? raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};

/**
 * Close time as a desk reads it: the clock always, the day only as far back as
 * it stays unambiguous — Yesterday, then the weekday inside a week, then the
 * date. Rendered client-side on purpose; the server's timezone is not the
 * viewer's, and a trade stamped an hour wrong is worse than no stamp.
 */
function closedAtLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const clock = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - d.getTime()) / 86_400_000) + 1;
  if (days <= 0) return `Today ${clock}`;
  if (days === 1) return `Yesterday ${clock}`;
  if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${clock}`;
}

type HistoryFilter = 'all' | 'wins' | 'losses';

/** Days back from midnight, or null for everything the query returned. */
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '2d', label: '2 days', days: 2 },
  { key: '3d', label: '3 days', days: 3 },
  { key: 'week', label: 'Week', days: 7 },
  { key: 'month', label: 'Month', days: 30 },
  { key: 'all', label: 'All', days: null },
];

const PAGE = 25;

function HistoryList({ trades, range, onRange, onOpenTrade }: {
  trades: BotTrade[];
  /** From the URL, so a refresh keeps the period you were looking at. */
  range: string;
  onRange: (v: string) => void;
  onOpenTrade: (t: BotTrade) => void;
}) {
  // Wins/Losses and the page stay local: they are a glance, not a place, and
  // putting every control in the address bar makes an unreadable URL.
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [limit, setLimit] = useState(PAGE);

  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  // Counted from midnight, not from "now minus 24h" — "Today" means today's
  // trades, not the last day's.
  const cutoff = (() => {
    if (days == null) return null;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d.getTime();
  })();

  const matched = trades
    .filter((t) => (filter === 'all' ? true : filter === 'wins' ? Number(t.pnl) > 0 : Number(t.pnl) < 0))
    .filter((t) => cutoff == null || (t.close_ts ? new Date(t.close_ts).getTime() >= cutoff : false));
  const shown = matched.slice(0, limit);

  const net = matched.reduce((s, t) => s + (Number(t.pnl) || 0), 0);

  const pick = <T,>(set: (v: T) => void, v: T) => () => { set(v); setLimit(PAGE); };

  const TABS: { key: HistoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'wins', label: 'Wins' },
    { key: 'losses', label: 'Losses' },
  ];

  return (
    <>
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={pick(setFilter, t.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                filter === t.key
                  ? 'border border-brand font-semibold text-brand'
                  : 'border border-transparent text-fg-muted hover:bg-brand/10 hover:text-brand'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="scrollbar-none mt-2 flex items-center gap-1 overflow-x-auto">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={pick(onRange, r.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
                range === r.key
                  ? 'bg-brand/15 font-semibold text-brand'
                  : 'text-fg-subtle hover:bg-brand/10 hover:text-brand'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {matched.length > 0 && (
          <p className="mt-2 flex items-center gap-2 text-[11px] text-fg-subtle">
            <span>{matched.length} trade{matched.length === 1 ? '' : 's'}</span>
            <span className={`ml-auto font-mono font-bold ${tone(net)}`}>{signed(net)}</span>
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty>
          {trades.length === 0
            ? 'No closed trades yet.'
            : `No ${filter === 'all' ? 'trades' : filter} in this period.`}
        </Empty>
      ) : (
        <ul className="space-y-2 px-4 pb-6 pt-3">
          {shown.map((t) => (
            <li key={t.id}>
              {/* A button, not a link. On this host /trade/<ticket> is
                  redirected to the desk itself, so the old anchor navigated
                  here from here and looked like a dead tap. */}
              <button
                type="button"
                onClick={() => onOpenTrade(t)}
                className="block w-full rounded-sm border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:border-brand/40"
              >
                <div className="flex items-center gap-2">
                  <SideBadge side={t.side === 'sell' ? 'sell' : 'buy'} />
                  <span className="text-sm font-bold text-fg">{t.symbol}</span>
                  <span className={`ml-auto font-mono tabular text-sm font-bold ${tone(t.pnl)}`}>
                    {signed(t.pnl)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="rounded-sm bg-surface-hover px-2 py-0.5 text-[11px] text-fg-muted">
                    {closeReasonLabel(t.close_reason)}
                  </span>
                  <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-fg-subtle">
                    {closedAtLabel(t.close_ts)}
                  </span>
                </div>
              </button>
            </li>
          ))}

          {/* Paged in the browser over what the query already returned. The
              count is the honest one — matched, not just rendered — so the
              list never quietly implies this is all there was. */}
          {shown.length < matched.length && (
            <li className="pt-1">
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE)}
                className="w-full rounded-sm border border-border py-2.5 text-sm text-fg-muted transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand"
              >
                Show {Math.min(PAGE, matched.length - shown.length)} more
                <span className="text-fg-subtle"> · {shown.length} of {matched.length}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────── */

/**
 * Is the bot running?
 *
 * Green while bot_market_state is being written; amber past five minutes, red
 * past twenty. A cycle takes seconds, so five minutes of silence already means
 * something is wrong — and silence is the one failure a trading screen must
 * never render as calm.
 */
function BotPulse({ iso }: { iso: string }) {
  const age = useNow(15_000) - new Date(iso).getTime();
  const tone = age > 20 * 60_000
    ? { dot: 'bg-danger', text: 'text-danger', label: 'bot silent' }
    : age > 5 * 60_000
      ? { dot: 'bg-warning', text: 'text-warning', label: 'bot quiet' }
      : { dot: 'bg-brand', text: 'text-fg-subtle', label: 'bot live' };
  return (
    <span className={`inline-flex items-center gap-1.5 ${tone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {/* The word itself can straddle a threshold between the server's clock
          reading and the browser's, same as the timestamp beside it. */}
      <span suppressHydrationWarning>{tone.label}</span> · <TimeAgo iso={iso} />
    </span>
  );
}

function Figure({ label, value, valueClass = 'text-fg' }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="shrink-0">
      <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-fg-subtle">{label}</p>
      <p className={`font-mono text-sm font-bold leading-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

/**
 * A section the design has and the bot does not yet fill.
 *
 * The mock's line — "This workspace view is ready for your data" — describes
 * the screen, not the situation, and its button goes nowhere. Same layout,
 * honest words: what would be here, and the one place that answer lives today.
 */
function Soon({ title, body, action }: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-sm bg-brand/15 text-brand">
        <BarChart3 className="h-6 w-6" />
      </span>
      <p className="mt-5 text-lg font-semibold text-fg">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 rounded-sm bg-surface-hover px-4 py-2.5 text-sm text-fg transition-colors hover:bg-brand/15 hover:text-brand"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-fg-subtle">{children}</p>;
}
