/**
 * The permission vocabulary. No imports, so anything may read it.
 *
 * SEPARATED FROM lib/admin.ts because this list is needed on BOTH sides. The
 * invite form is a client component and wants to render a checkbox per
 * permission; lib/admin.ts reaches for `next/headers` through the server
 * Supabase client, so importing the list from there dragged server-only code
 * into the browser bundle and took every page down with:
 *
 *   You're importing a module that depends on "next/headers"
 *
 * A constant with no dependencies cannot do that to anybody. lib/admin.ts
 * re-exports it, so nothing that already imported it from there had to change.
 */

export const PERMISSIONS = [
  "users.view",
  "users.edit",
  "users.disable",
  "users.delete",
  "bot.view",
  "bot.configure",
  "finance.view",
  "admins.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Whether a string from a form or a database column is one we know. */
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * What each permission means, in plain English.
 *
 * Victor: "write in plain english not user.view. something like 'view users'".
 * He is right — `users.disable` is a key in a database column, and printing it
 * on the form where somebody decides what a colleague may do asks them to
 * translate as they read. The dotted name stays the identifier everywhere in
 * code and in the audit log; it should not be the thing on screen.
 *
 * `label` is the action. `hint` is the consequence, for the cases where the
 * label alone is ambiguous about how far it reaches — "Suspend users" does not
 * say that they are locked out immediately, and that is the part worth knowing
 * before ticking it.
 */
export const PERMISSION_LABELS: Record<Permission, { label: string; hint: string }> = {
  "users.view": {
    label: "View users",
    hint: "See the customer list and anyone's account",
  },
  "users.edit": {
    label: "Edit users",
    hint: "Change an account's details and broker link",
  },
  "users.disable": {
    label: "Suspend users",
    hint: "Lock someone out, immediately. Reversible.",
  },
  "users.delete": {
    label: "Delete users",
    hint: "Anonymise an account for good. Not reversible.",
  },
  "bot.view": {
    label: "View the bot",
    hint: "Markets, trades, the chart and performance",
  },
  "bot.configure": {
    label: "Control the bot",
    hint: "Lot sizes, profit targets, and the switch that stops trading",
  },
  "finance.view": {
    label: "View money",
    hint: "Revenue, billing, payments and Scora spend",
  },
  "admins.manage": {
    label: "Manage admins",
    hint: "Invite colleagues, set roles, remove access",
  },
};

/** The plain-English label, falling back to the key for anything unknown. */
export function permissionLabel(permission: string): string {
  return isPermission(permission)
    ? PERMISSION_LABELS[permission].label
    : permission;
}

/** A role's permissions as a readable sentence fragment. */
export function describePermissions(permissions: string[]): string {
  if (permissions.length === 0) return "Nothing on its own";
  return permissions.map(permissionLabel).join(" · ");
}
