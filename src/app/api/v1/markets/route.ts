import { NextResponse } from "next/server";
import { authenticateApiRequest, withRateLimitHeaders } from "@/lib/api-auth";
import { MARKETS } from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P2-603 — GET /api/v1/markets
 *
 * Which markets we trade and whether each is currently open. Session state is
 * computed rather than read from the bot: FX and crypto keep different hours
 * and that is a calendar fact, not something that needs a database round trip.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) return auth.response;

  const now = new Date();

  return withRateLimitHeaders(
    NextResponse.json(
      {
        data: MARKETS.map((m) => ({
          symbol: m.symbol,
          kind: m.kind,
          // Crypto runs 24/7 including weekends; FX does not.
          open: m.kind === "crypto" ? true : isForexOpen(now),
        })),
        count: MARKETS.length,
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    ),
    auth.calls,
  );
}

/**
 * FX opens Sunday 22:00 UTC and closes Friday 22:00 UTC. Approximate by
 * design — it does not model the broker's holiday calendar, and the docs say
 * so. A wrong "open" here costs a developer a confusing minute; it does not
 * place a trade.
 */
function isForexOpen(now: Date): boolean {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();

  if (day === 6) return false;
  if (day === 0) return hour >= 22;
  if (day === 5) return hour < 22;
  return true;
}
