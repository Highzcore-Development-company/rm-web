import { createHash, randomInt } from "node:crypto";

/**
 * Email verification codes, issued and checked by us.
 *
 * Supabase sends no mail in this product — not auth mail, not anything. The
 * code is generated here, stored hashed, and delivered by nodemailer over the
 * same SMTP server the company site uses.
 */

export const CODE_LENGTH = 6;

/** Long enough to be read off a phone and typed, short enough to be useless later. */
export const CODE_TTL_MINUTES = 15;

/** A million codes; without a ceiling, guessing is minutes of scripted work. */
export const MAX_ATTEMPTS = 5;

/** Stops the resend button being a free mailer for any address someone types. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * randomInt, not Math.random. Math.random is not a CSPRNG: its output is
 * predictable from previous values, and this is a credential that confirms
 * ownership of an email address.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * Constant-time comparison.
 *
 * Both sides are fixed-length hex of the same length, so a plain === would be
 * safe in practice — but "in practice" is doing a lot of work in a sentence
 * about a credential check, and the cost of not relying on it is three lines.
 */
export function codeMatches(presented: string, storedHash: string): boolean {
  const hashed = hashCode(presented);
  if (hashed.length !== storedHash.length) return false;

  let difference = 0;
  for (let i = 0; i < hashed.length; i += 1) {
    difference |= hashed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return difference === 0;
}

export function expiryFromNow(now = new Date()): Date {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
}

export function canResend(lastSentAt: string | Date, now = new Date()): boolean {
  const last = new Date(lastSentAt).getTime();
  return now.getTime() - last >= RESEND_COOLDOWN_SECONDS * 1000;
}
