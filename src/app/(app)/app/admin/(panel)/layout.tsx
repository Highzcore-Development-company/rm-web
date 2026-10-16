import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AdminSidebar,
  type NavGroup,
} from "@/components/admin/shell/admin-sidebar";
import { AdminProfileMenu } from "@/components/admin/shell/admin-profile-menu";
import { LiveBell } from "@/components/admin/shell/live-bell";
import { PendingBell } from "@/components/admin/shell/pending-bell";
import { getAdmin, recordAdminLogin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { createRmServerClient } from "@/lib/supabase/rm-server";
import type { BotMarket } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";

/**
 * The admin area.
 *
 * THE GUARD LIVES HERE rather than in each page: a layout wraps every route
 * beneath it, so a new admin page is protected the moment it is created instead
 * of depending on whoever adds it remembering. The pages keep their own check
 * as well — defence in depth is cheap and this is the boundary between one
 * investor's data and everyone's.
 *
 * notFound(), not a "forbidden" page: a non-admin should not learn these URLs
 * are real.
 *
 * The chrome is Victor's: profile top right with logout/profile/settings, the
 * live-market figure beside it, and a grouped sidebar. The groups follow the
 * separation the figures keep — the bot's money is never the company's — so
 * the navigation says it before any number does.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await getAdmin();
  if (!admin) notFound();

  // Staff login activity. Keyed on the auth system's own last_sign_in_at, so
  // this writes once per actual sign-in no matter how many admin pages get
  // loaded. Never throws: an audit convenience must not keep staff out.
  await recordAdminLogin(admin.userId, admin.lastSignInAt);

  // A1. A seeded password is a known password, and this account can disable
  // users and read financials. Blocked here rather than per page, so a route
  // added later is covered the moment it exists.
  if (admin.mustChangePassword) redirect("/app/admin/change-password");

  const canSeeUsers = admin.permissions.includes("users.view");
  const canSeeBot = admin.permissions.includes("bot.view");
  const canSeeFinance = admin.permissions.includes("finance.view");
  const canManageAdmins = admin.permissions.includes("admins.manage");

  // What the sidebar badges and the bell need. Read here so every page has it
  // without each one fetching its own copy — and read only where the admin is
  // allowed to see it, so the badge cannot leak a count off a page they
  // cannot open.
  const [marketRows, claimsWaiting] = await Promise.all([
    canSeeBot ? liveMarkets() : Promise.resolve([] as BotMarket[]),
    canSeeFinance ? pendingClaims() : Promise.resolve(0),
  ]);

  const enabled = marketRows.filter((m) => m.state !== "disabled").length;

  const groups: NavGroup[] = [
    {
      label: null,
      items: [{ href: "/app/admin", label: "Overview", icon: "overview" }],
    },
    ...(canSeeBot
      ? [
          {
            label: "Trading",
            items: [
              { href: "/app/admin/chart", label: "Chart", icon: "chart" as const },
              {
                href: "/app/admin/markets",
                label: "Markets",
                icon: "markets" as const,
                badge: enabled ? String(enabled) : null,
              },
              {
                href: "/app/admin/history",
                label: "History",
                icon: "history" as const,
              },
              // KEPT FROM THE OLD PANEL, deliberately. Victor replaced the
              // admin navigation, not the global trading switch — and this is
              // the only screen that holds it, along with approval mode and
              // the rm-server connection every market write depends on.
              // Dropping it from the sidebar would have made the kill switch
              // unreachable rather than retired.
              {
                href: "/app/admin/bot",
                label: "Bot controls",
                icon: "controls" as const,
              },
            ],
          },
        ]
      : []),
    ...(canSeeUsers || canManageAdmins
      ? [
          {
            label: "People",
            items: [
              ...(canSeeUsers
                ? [{ href: "/app/admin/users", label: "Users", icon: "users" as const }]
                : []),
              ...(canManageAdmins
                ? [
                    {
                      href: "/app/admin/admins",
                      label: "Admins",
                      icon: "admins" as const,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
    // The old panel's finance screens. Victor replaced the admin NAVIGATION,
    // not the payment work these do — claims, refunds and Scora spend are live
    // features with no new home, and dropping them from the sidebar would make
    // them unreachable rather than retired.
    ...(canSeeFinance
      ? [
          {
            label: "Company",
            items: [
              {
                href: "/app/admin/links",
                label: "Account claims",
                icon: "links" as const,
                badge: claimsWaiting ? String(claimsWaiting) : null,
                badgeTone: "accent" as const,
              },
              {
                href: "/app/admin/billing",
                label: "Billing",
                icon: "billing" as const,
              },
              { href: "/app/admin/scora", label: "Scora", icon: "scora" as const },
            ],
          },
        ]
      : []),
  ];

  const initials = initialsOf(admin.email);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/app/admin"
              className="shrink-0 text-lg font-semibold tracking-tight"
            >
              Highzcore
            </Link>
            <span className="shrink-0 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              Admin
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Only for an admin who may see the bot at all. Both read the
                bot's live state, which is bot.view's business.

                TWO NOTIFICATIONS, not one, because they answer different
                questions. Pending is a COUNT of setups waiting to trigger;
                live is the floating P&L of what is already open, where the
                count barely matters. The desk used to carry both as tabs in a
                rail — they are in the navbar now, where a number you want to
                see without navigating belongs. */}
            {canSeeBot ? (
              <>
                <PendingBell initial={marketRows} />
                <LiveBell initial={marketRows} />
              </>
            ) : null}
            <ThemeToggle />
            <AdminProfileMenu
              profile={{
                email: admin.email,
                role: admin.role,
                isSuper: admin.isSuper,
                initials,
              }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[100rem] gap-8 px-4 py-6 sm:px-6 lg:py-8">
        <aside className="shrink-0 lg:w-56">
          <div className="lg:sticky lg:top-24">
            <AdminSidebar groups={groups} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/** Market rows for the bell. Full rows: the live store holds BotMarket. */
async function liveMarkets(): Promise<BotMarket[]> {
  const client = createRmServerClient();
  if (!client) return [];
  const { data } = await client.from("bot_market_state").select("*");
  return (data ?? []) as BotMarket[];
}

/** Claimed a broker login, nobody has checked it yet. */
async function pendingClaims(): Promise<number> {
  const service = createServiceClient();
  const { count } = await service
    .from("investors")
    .select("id", { count: "exact", head: true })
    .not("vantage_account_id", "is", null)
    .is("linked_at", null)
    .is("deleted_at", null);
  return count ?? 0;
}

/**
 * Initials from an email address.
 *
 * `victor@fatsees.com` → VI. Two letters of the local part, because a
 * single-letter avatar is indistinguishable between colleagues whose addresses
 * start the same way, and we have no stored display name for staff.
 */
function initialsOf(email: string | null): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "AD").toUpperCase();
}
