"use client";

import Link from "next/link";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { signOutAndGoHome } from "@/lib/sign-out";
import { useDismissable } from "@/components/admin/shell/use-dismissable";

export type AdminProfile = {
  email: string | null;
  role: string;
  isSuper: boolean;
  initials: string;
};

/**
 * The admin's own account, top right.
 *
 * Victor: "at the top I want to see the admin profile, where the admin will
 * click to logout, see his profile, see settings on them and the rest."
 *
 * THE ROLE IS ON THE FACE OF IT, not buried in the menu. An admin's permissions
 * decide what every other screen will let them do, so "Support" or "Super
 * admin" under the address answers the question behind most "why can't I…"
 * before it is asked.
 *
 * Closes on Escape and on a click outside, not only on its own button — a menu
 * that can only be closed the way it was opened is one people leave open by
 * accident, and this one sits over the figures.
 */
export function AdminProfileMenu({ profile }: { profile: AdminProfile }) {
  // Same hook as the two bells beside it — hover on desktop, click everywhere,
  // Escape and click-outside to dismiss. See use-dismissable.ts.
  const { open, setOpen, ref: container, hoverProps } = useDismissable();

  return (
    <div className="relative" ref={container} {...hoverProps}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-fg-muted transition-colors hover:text-fg"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
          {profile.initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[12rem] truncate text-xs font-medium text-fg">
            {profile.email ?? "Signed in"}
          </span>
          <span className="block text-[11px] text-fg-subtle">
            {profile.isSuper ? "Super admin" : profile.role}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          /* w-60 is 240px and the avatar is the right-most control, so
             this one has always fitted. Left as it is rather than
             changed for symmetry. */
          className="surface-raised absolute right-0 top-12 z-50 w-60 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border py-1.5 shadow-elev-2"
        >
          <div className="px-3.5 py-2">
            <p className="truncate text-xs font-medium">
              {profile.email ?? "Signed in"}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-subtle">
              <ShieldCheck className="size-3" aria-hidden="true" />
              {profile.isSuper ? "Super admin — every permission" : profile.role}
            </p>
          </div>

          <div className="my-1 border-t border-border" />

          <MenuLink href="/app/admin/profile" Icon={UserRound}>
            My profile
          </MenuLink>
          <MenuLink href="/app/admin/settings" Icon={Settings2}>
            Settings
          </MenuLink>
          {/* An admin is also a user. `?view=investor` is required, not
              cosmetic: /app/dashboard redirects an admin straight back here,
              and this parameter is the one thing that stops it. */}
          <MenuLink href="/app/dashboard?view=investor" Icon={LayoutDashboard}>
            Investor view
          </MenuLink>

          <div className="my-1 border-t border-border" />

          <button
            type="button"
            role="menuitem"
            onClick={signOutAndGoHome}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      ) : null}
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
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
