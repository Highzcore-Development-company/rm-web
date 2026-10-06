import { createHash, randomBytes } from "node:crypto";
import { envNumberOr } from "@/lib/env";

/**
 * P2-601 — API key issuance.
 *
 * A key is shown to the developer exactly once. We store its SHA-256 and the
 * first few characters. That means a database leak yields no working
 * credentials, and "I lost my key" is answered by rotating it — which is the
 * truthful answer, because we genuinely cannot read it back.
 *
 * SHA-256 rather than bcrypt/argon2 deliberately. Those are for passwords,
 * which are short, guessable and reused. This is 32 bytes of CSPRNG output:
 * there is nothing to brute-force, and a slow hash on every API request would
 * be a self-inflicted rate limit.
 */

const PREFIX = "hz_live_";

export type GeneratedKey = {
  /** Shown once. Never stored. */
  plaintext: string;
  hash: string;
  /** Safe to display and store — identifies a key without being usable. */
  prefix: string;
};

export function generateApiKey(): GeneratedKey {
  // 32 bytes, base64url: ~43 chars, no padding, URL and header safe.
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${PREFIX}${secret}`;

  return {
    plaintext,
    hash: hashApiKey(plaintext),
    // Enough to tell two keys apart in a list, far too little to use.
    prefix: plaintext.slice(0, PREFIX.length + 6),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/**
 * Pulls the key out of an incoming request.
 *
 * Authorization: Bearer <key> is the documented form. X-API-Key is accepted
 * because people will send it regardless, and a 401 that was really a header
 * naming disagreement wastes everyone's afternoon.
 */
export function keyFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }

  const header = request.headers.get("x-api-key");
  return header?.trim() || null;
}

/** Calls per minute, per key. Documented in the API docs page (P2-605). */
export const RATE_LIMIT_PER_MINUTE = Number(
  envNumberOr(process.env.API_RATE_LIMIT_PER_MINUTE, 60),
);
