"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  CandlestickChart,
  CreditCard,
  History as HistoryIcon,
  LayoutDashboard,
  Link2,
  Menu,
  SlidersHorizontal,
  ShieldCheck,
  Sparkles,
  Users,
  Briefcase,
  ClipboardList,
  FileText,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  reports: ClipboardList,
  portfolio: Briefcase,
  content: FileText,
  chart: CandlestickChart,
  markets: Bot,
  controls: SlidersHorizontal,
  history: HistoryIcon,
  users: Users,
  admins: ShieldCheck,
  links: Link2,
  billing: CreditCard,
  scora: Sparkles,
};

export type NavIcon = keyof typeof ICONS;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Shown on the right of the row — a count, a figure, a warning. */
  badge?: string | null;
  /** Draws the badge as something that wants attention rather than as a count. */
  badgeTone?: "neutral" | "accent" | "warn";
};

export type NavGroup = {
  /** Null for the first group, which needs no heading above the home link. */
  label: string | null;
  items: NavItem[];
};

/**
 * The admin sidebar.
 *
 * GROUPED, because the flat list stopped being readable at nine entries and
 * the groups are not cosmetic: the first is the bot, the second is people, the
 * third is company money. That is the same separation the figures keep — the
 * master account's P&L is never company revenue (see lib/admin/trading-pnl.ts)
 * — so the navigation says it before any number does.
 *
 * A client component purely so the active item comes from the real path.
 * Passing it down from each page works until somebody adds a page and forgets,
 * and a sidebar with nothing highlighted is worse than none: it makes you read
 * the URL to work out where you are.
 */
export function AdminSidebar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* The mobile opener. The sidebar is a drawer below lg, because at phone
          width a nine-item nav above the content pushes the page itself off
          the first screen. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg lg:hidden"
        aria-expanded={open}
      >
        <Menu className="size-4" aria-hidden="true" />
        Menu
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <div className="surface-raised absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-border p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">Admin</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-fg-muted hover:text-fg"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Nav groups={groups} pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="hidden lg:block">
        <Nav groups={groups} pathname={pathname} />
      </div>
    </>
  );
}

function Nav({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Admin" className="space-y-6">
      {groups.map((group, index) => (
        <div key={group.label ?? `group-${index}`}>
          {group.label ? (
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <Row
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Row({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon];

  // Exact match for the index, prefix for everything else — otherwise
  // /app/admin stays highlighted on every child page. The trailing slash on
  // the prefix test stops /app/admin/users matching /app/admin/users-export.
  const active =
    item.href === "/app/admin"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const tone =
    item.badgeTone === "accent"
      ? "bg-accent text-[#0A0A0A]"
      : item.badgeTone === "warn"
        ? "border border-accent/40 text-accent"
        : "border border-border text-fg-muted";

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
          active
            ? "bg-accent/10 font-medium text-accent"
            : "text-fg-muted hover:bg-surface hover:text-fg"
        }`}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge ? (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${tone}`}
          >
            {item.badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
