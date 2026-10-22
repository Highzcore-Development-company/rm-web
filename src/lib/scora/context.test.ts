import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Scora must survive a bot column it has never heard of.
 *
 * THE BUG THESE PIN, twice over. bot_market_state is the BOT's table, and the
 * two repos deploy independently — so this one names columns that may not
 * exist yet. PostgREST rejects the WHOLE select on an unknown column, and the
 * old code mapped that straight to an empty list. Scora then answered with no
 * market data at all, which reads as a vague model rather than a broken one:
 * nothing errors, nothing is logged, and the only symptom is worse answers.
 *
 * It has now happened twice — `spread` in October, `htf2` on 21 Oct when the
 * frontend merged ahead of the bot's migration 023. Hence a test rather than
 * another fix.
 */

const selects: string[] = [];
let failOnHtf2 = true;
let failEverything = false;

vi.mock("@/lib/supabase/rm-server", () => ({
  createRmServerClient: () => ({
    from(table: string) {
      return {
        select(columns: string) {
          if (table === "bot_market_state") selects.push(columns);

          const reject = {
            data: null,
            error: { message: 'column bot_market_state.htf2 does not exist' },
          };
          if (table === "bot_market_state") {
            // failEverything is the feed being down, so BOTH attempts fail —
            // not a missing column.
            if (failEverything) return Promise.resolve(reject);
            if (failOnHtf2 && columns.includes("htf2")) {
              return Promise.resolve(reject);
            }
            return Promise.resolve({
              data: [
                {
                  symbol: "GBPAUD+",
                  alias: "GBPAUD",
                  timeframe: "M15",
                  htf: "H1",
                  entry_trend: "Sideways",
                  htf_trend: "Sideways",
                  ...(columns.includes("htf2")
                    ? { htf2: "H4", htf2_trend: "Downtrend" }
                    : {}),
                  trend_strength: "None",
                  state: "active",
                  reason: "Trend Confirmed",
                  price: 1.90683,
                  level: 1.90534,
                  latest_signal: "SHORT @ 1.90534",
                  snapshot: { rsi: 53.2, adx: 18.9 },
                  updated_at: "2026-10-21T10:22:12Z",
                },
              ],
              error: null,
            });
          }
          // bot_settings / bot_trades: enough shape to not throw.
          const chain = {
            data: [],
            error: null,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            not: () => chain,
            order: () => chain,
            limit: () => Promise.resolve({ data: [], error: null }),
            then: (f: (v: unknown) => unknown) =>
              Promise.resolve(f({ data: [], error: null })),
          };
          return chain;
        },
      };
    },
  }),
}));

async function load() {
  const mod = await import("./context");
  return mod.getScoraContext();
}

describe("Scora market context", () => {
  beforeEach(() => {
    selects.length = 0;
    failOnHtf2 = true;
    failEverything = false;
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("still has market data when the bot has not run migration 023", async () => {
    const ctx = await load();

    // The whole point: market data survives a column this repo does not own.
    expect(ctx.markets).toHaveLength(1);
    expect(ctx.markets[0].symbol).toBe("GBPAUD+");
    expect(ctx.markets[0].trend).toBe("Sideways");
  });

  it("asks for the optional columns first, and only then without them", async () => {
    await load();

    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain("htf2");
    // The retry must not quietly drop anything else on the way.
    expect(selects[1]).not.toContain("htf2");
    expect(selects[1]).toContain("entry_trend");
    expect(selects[1]).toContain("snapshot");
  });

  it("reports a missing column as absent rather than as a reading", async () => {
    const ctx = await load();

    // null, not undefined: downstream renders "no 4H reading" for null and
    // must not have to know which of the two reasons produced it.
    expect(ctx.markets[0].htf2).toBeNull();
    expect(ctx.markets[0].htf2Trend).toBeNull();
  });

  it("uses the 4H reading once the column exists", async () => {
    failOnHtf2 = false;
    const ctx = await load();

    expect(selects).toHaveLength(1);
    expect(ctx.markets[0].htf2).toBe("H4");
    expect(ctx.markets[0].htf2Trend).toBe("Downtrend");
  });

  it("says so out loud when the market feed is unreadable", async () => {
    failEverything = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const ctx = await load();

    // An empty context is a legitimate answer ("not connected"). Reaching it
    // SILENTLY is not — that is how a broken feed goes unnoticed for a week.
    expect(ctx.markets).toHaveLength(0);
    expect(err).toHaveBeenCalled();
  });
});
