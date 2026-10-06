import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  hashApiKey,
  keyFromRequest,
  RATE_LIMIT_PER_MINUTE,
} from "@/lib/api-keys";

/**
 * P2-605 — authentication and rate limiting for /api/v1.
 *
 * Both happen in one database call: record_api_call() looks the key up and
 * increments its bucket in a single statement. Checking then incrementing is a
 * race, and a racing rate limiter is not one.
 */

export type ApiAuthOk = { ok: true; keyId: string; calls: number };
export type ApiAuthFail = { ok: false; response: NextResponse };

function problem(status: number, error: string, message: string, extra?: HeadersInit) {
  return NextResponse.json(
    { error, message },
    { status, headers: { "Cache-Control": "no-store", ...extra } },
  );
}

export async function authenticateApiRequest(
  request: Request,
): Promise<ApiAuthOk | ApiAuthFail> {
  const presented = keyFromRequest(request);

  if (!presented) {
    return {
      ok: false,
      response: problem(
        401,
        "missing_api_key",
        "Send your key as 'Authorization: Bearer <key>'.",
        // Tells a well-behaved client how to authenticate rather than making
        // them read the docs to discover the scheme.
        { "WWW-Authenticate": 'Bearer realm="api"' },
      ),
    };
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("record_api_call", {
    p_key_hash: hashApiKey(presented),
    p_limit: RATE_LIMIT_PER_MINUTE,
  });

  if (error) {
    console.error("[api-auth] record_api_call failed:", error);
    return {
      ok: false,
      response: problem(503, "unavailable", "Try again shortly."),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  // No key id means no such key, or revoked. One message for both: an attacker
  // should not be able to learn that a key once existed.
  if (!row?.key_id) {
    return {
      ok: false,
      response: problem(401, "invalid_api_key", "That key is not valid."),
    };
  }

  if (!row.allowed) {
    const retryAfter = 60 - new Date().getSeconds();
    return {
      ok: false,
      response: problem(
        429,
        "rate_limited",
        `Limit is ${RATE_LIMIT_PER_MINUTE} requests per minute.`,
        {
          // Seconds until the current bucket rolls over, so a client can wait
          // exactly long enough instead of guessing.
          "Retry-After": String(Math.max(retryAfter, 1)),
          "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE),
          "X-RateLimit-Remaining": "0",
        },
      ),
    };
  }

  return { ok: true, keyId: row.key_id as string, calls: row.calls as number };
}

/** Adds the rate-limit headers a successful response should also carry. */
export function withRateLimitHeaders(
  response: NextResponse,
  calls: number,
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(RATE_LIMIT_PER_MINUTE));
  response.headers.set(
    "X-RateLimit-Remaining",
    String(Math.max(RATE_LIMIT_PER_MINUTE - calls, 0)),
  );
  return response;
}
