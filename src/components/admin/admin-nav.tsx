"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ShieldCheck,
  TrendingUp,
  CreditCard,
  LayoutDashboard,
  Link2,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  links: Link2,
  billing: CreditCard,
  users: Users,
  bot: Bot,
  admins: ShieldCheck,
  trading: TrendingUp,
};

export type AdminNavItem = {
  href: string;
  label: string;
  icon: "overview" | "links" | "billing" | "users" | "bot" | "admins" | "trading";
};

/**
 * The admin side nav.
 *
 * A client component purely so the active item can come from the real path.
 * Passing it down from each page works until someone adds a page and forgets,
 * and a sidebar with nothing highlighted is worse than no sidebar — it makes
 * you check the URL to work out where you are.
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          // Exact match for the index, prefix for the rest — otherwise
          // /app/admin stays highlighted on every child page.
          const active =
            item.href === "/app/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-fg-muted hover:bg-surface hover:text-fg"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
