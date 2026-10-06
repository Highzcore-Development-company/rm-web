import { createRmServerClient } from "@/lib/supabase/rm-server";

/**
 * P2-503 / P2-504 — what the bot has open, and what it has closed.
 *
 * Reads from rm-server, the bot's project. We do not own that schema, so the
 * table and column names below are a guess until Victor confirms them — hence
 * everything funnels through two functions that return null rather than
 * scattering assumptions through the UI.
 *
 * MIRRORED, NOT PER-ACCOUNT. The bot trades a master and the MAM copies to each
 * investor proportionally. So what we can honestly show is the master's
 * positions, labelled as such. Showing them as "your positions" would imply we
 * have read their account, which we have not — and the sizes would be wrong.
 */

export type LivePosition = {
  id: string;
  market: string;
  side: "buy" | "sell";
  openedAt: string;
  /** Unrealised result in R multiples. Signed. */
  unrealisedR: number | null;
};

export type ClosedTrade = {
  id: string;
  market: string;
  side: "buy" | "sell";
  openedAt: string;
  closedAt: string;
  resultR: number;
};

/** Table names on rm-server. Confirm with Victor before trusting these. */
const OPEN_TABLE = process.env.RM_SERVER_OPEN_TABLE ?? "bot_open_positions";
const CLOSED_TABLE = process.env.RM_SERVER_CLOSED_TABLE ?? "bot_trades";

export async function getLivePositions(): Promise<LivePosition[] | null> {
  const client = createRmServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from(OPEN_TABLE)
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(50);

  if (error) {
    // Expected until the table names are confirmed. Logged, not thrown: a
    // dashboard that 500s because one panel cannot load is worse than a
    // dashboard with one panel saying it cannot load.
    console.error("[positions] live read failed:", error.message);
    return null;
  }

  return (data ?? []) as unknown as LivePosition[];
}

export async function getClosedTrades(): Promise<ClosedTrade[] | null> {
  const client = createRmServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from(CLOSED_TABLE)
    .select("*")
    .order("closed_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[positions] closed read failed:", error.message);
    return null;
  }

  return (data ?? []) as unknown as ClosedTrade[];
}
