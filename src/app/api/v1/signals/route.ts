import { NextResponse } from "next/server";
import { authenticateApiRequest, withRateLimitHeaders } from "@/lib/api-auth";
import { getLivePositions } from "@/lib/positions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P2-604 — GET /api/v1/signals
 *
 * GATED OFF BY DEFAULT, and that is the decision, not an oversight.
 *
 * D4 — what the free tier returns versus the paid one — is unanswered. Live
 * signals are the product: publishing them to anyone with a free key undercuts
 * the $20 subscription, and once they are out we cannot take them back. The
 * safe default is closed.
 *
 * Flip API_SIGNALS_ENABLED once D4 is decided and tiering exists.
 */
const ENABLED = process.env.API_SIGNALS_ENABLED === "true";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) return auth.response;

  if (!ENABLED) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          error: "not_enabled",
          message:
            "Signals are not yet available on the public API. See the docs for status.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
      auth.calls,
    );
  }

  const positions = await getLivePositions();

  if (!positions) {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: "unavailable", message: "Live positions are not available." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
      auth.calls,
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      {
        // No volume, ever. Lot size plus a result reveals the master's account
        // size and from it every investor's allocation.
        data: positions.map((p) => ({
          symbol: p.symbol,
          side: p.side,
          opened_at: p.openedAt,
          open_price: p.openPrice,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    ),
    auth.calls,
  );
}
