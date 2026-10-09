import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Staff invitation tokens.
 *
 * AN INVITE LINK IS A CREDENTIAL. Whoever holds it becomes staff with the role
 * baked in, so it is treated like one: 32 random bytes from a CSPRNG, stored
 * only as a SHA-256 hash, and compared in constant time. If the table leaks,
 * nothing in it can be replayed.
 *
 * Longer than the 6-digit email code in verification.ts, and for a different
 * reason. That code is short because a human retypes it, and it is protected
 * by an attempt limit and a 15-minute life. Nobody types this one — it arrives
 * as a link — so there is no reason to make it guessable, and no attempt
 * counter to lean on.
 */

/** Bytes of entropy. 256 bits: not guessable, and short enough for a URL. */
const TOKEN_BYTES = 32;

/** How long an invitation stays usable. Mirrors the database default. */
export const INVITE_TTL_DAYS = 7;

export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant time, so the comparison cannot be timed to recover the token a
 * character at a time. Hashes are fixed length, which is what makes
 * timingSafeEqual usable without leaking length.
 */
export function inviteTokenMatches(
  presented: string,
  storedHash: string,
): boolean {
  const a = Buffer.from(hashInviteToken(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function inviteUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/app/admin/accept?token=${encodeURIComponent(token)}`;
}
