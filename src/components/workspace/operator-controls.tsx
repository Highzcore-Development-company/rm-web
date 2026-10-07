"use client";

import { Lock } from "lucide-react";

/**
 * Investor-safe stand-ins for highzcore's operator controls.
 *
 * The ported workspace is the same screen our own desk uses, and that desk has
 * the controls an operator needs: the trading switch, flatten-all, approval
 * mode, per-market enable, cancel-order, lot size. None of those belong to an
 * investor. They act on OUR master account, so a single one of them reaching a
 * customer's browser is not a cosmetic bug — it is a stranger with a kill
 * switch on the book.
 *
 * So rather than delete the call sites (which would mean editing a 2,400-line
 * port and guaranteeing it drifts from the original), the same component names
 * are exported here as read-only. The markup stays identical; the power does
 * not come with it.
 *
 * What an investor gets instead is one control of their own — "let the bot
 * trade my account" — which lives in the dashboard header, not in here.
 */

function ReadOnly({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-fg-subtle">
      <Lock className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}

export function TradingSwitchButton({ enabled }: {
  enabled: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  seenByBotAt?: string | null;
}) {
  return <ReadOnly>{enabled ? "Bot is trading" : "Bot is paused"}</ReadOnly>;
}

export function FlattenAllButton({ openCount }: { openCount: number }) {
  return <ReadOnly>{openCount} open</ReadOnly>;
}

export function ApprovalModeToggle({ required }: { required: boolean }) {
  return <ReadOnly>{required ? "Approval required" : "Trading automatically"}</ReadOnly>;
}

export function MarketEnableToggle({ enabled }: { symbol: string; enabled: boolean }) {
  return <ReadOnly>{enabled ? "On" : "Off"}</ReadOnly>;
}

export function CancelOrderButton(_: {
  symbol: string;
  alias?: string | null;
  ticket?: number | null;
  level?: number | null;
}) {
  return null;
}
