import { NextResponse } from "next/server";
import { authenticateApiRequest, withRateLimitHeaders } from "@/lib/api-auth";
import { getPerformanceSummary, isStale } from "@/lib/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * P2-602 — GET /api/v1/performance
 *
 * The same figures as the public page, as JSON. Cached briefly: the underlying
 * equity snapshot updates on the bot's schedule, not per request, so serving a
 * few-minute-old number costs nothing and a cache stampede costs real latency.
 */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.ok) return auth.response;

  const summary = await getPerformanceSummary();

  // 503, not 200-with-nulls. A client should be able to tell "we have no
  // figures right now" from "the figures are zero", and a JSON body of nulls
  // reads as the second.
  if (!summary || isStale(summary)) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          error: "unavailable",
          message: "The performance feed is not currently available.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
      auth.calls,
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      {
        data: {
          total_return: summary.totalReturn,
          max_drawdown: summary.maxDrawdown,
          win_rate: summary.winRate,
          // null means no losing trade yet, not unknown and not infinite.
          profit_factor: summary.profitFactor,
          trade_count: summary.tradeCount,
          months_live: summary.monthsLive,
          as_of: summary.asOf,
        },
        disclosure:
          "Past performance does not predict future results. Trading carries risk of loss.",
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
    ),
    auth.calls,
  );
}
