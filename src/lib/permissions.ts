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
