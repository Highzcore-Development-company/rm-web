import type { Permission } from "@/lib/permissions";

/**
 * Where an admin lands when they cannot see the Overview.
 *
 * Now that overview.view can be withheld, somebody can arrive at /app/admin
 * holding no right to it. A 404 straight after signing in reads as broken
 * rather than as a decision, so they are sent to the first section they CAN
 * open instead.
 *
 * THE ORDER MIRRORS THE SIDEBAR deliberately. "First page they can see" has to
 * mean the same thing in both places, or the redirect lands somewhere that is
 * not the first item in their nav and looks arbitrary.
 *
 * Kept as data rather than branching logic so adding a section is one line
 * here and one in the layout — and so the two lists can be read side by side
 * when they drift.
 */
const IN_SIDEBAR_ORDER: { href: string; needs: Permission }[] = [
  { href: "/app/admin", needs: "overview.view" },
  { href: "/app/admin/chart", needs: "bot.view" },
  { href: "/app/admin/markets", needs: "bot.view" },
  { href: "/app/admin/history", needs: "bot.view" },
  { href: "/app/admin/bot", needs: "bot.view" },
  { href: "/app/admin/users", needs: "users.view" },
  { href: "/app/admin/admins", needs: "admins.manage" },
  { href: "/app/admin/links", needs: "users.view" },
  { href: "/app/admin/billing", needs: "finance.view" },
  { href: "/app/admin/scora", needs: "finance.view" },
];

/**
 * The first admin page these permissions can open, or null for none at all.
 *
 * NULL IS A REAL ANSWER and the caller has to handle it: a role can exist with
 * no permissions — `admin_roles.permissions` defaults to an empty array — so
 * an admin who can open nothing is a configuration somebody can create by
 * accident. Sending them in a circle would be worse than telling them.
 */
export function firstVisibleAdminPath(
  permissions: readonly Permission[],
): string | null {
  // Their own profile is excluded on purpose. Everybody has one, so it would
  // always match and nobody would ever be told they have no sections —
  // the empty-role case would look like a working account that opens on a
  // settings page.
  const found = IN_SIDEBAR_ORDER.find((entry) =>
    permissions.includes(entry.needs),
  );
  return found?.href ?? null;
}
