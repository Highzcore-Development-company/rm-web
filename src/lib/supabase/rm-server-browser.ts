"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client for rm-server, the bot's Supabase project.
 *
 * rm-web's own client (`@/lib/supabase/client`) points at the app project —
 * investors, subscriptions, payments. Everything `bot_*` lives in rm-server,
 * so anything reading it from the browser needs this one.
 *
 * There is no shared session across the two. The signed-in investor's token is
 * issued by the app project, so `auth.uid()` is always null here and reads are
 * governed entirely by rm-server's own RLS. Anything exposed to this client is
 * exposed to every visitor — rm-server must publish only what is safe to
 * publish, and must never be given a policy that trusts the caller.
 *
 * NEXT_PUBLIC_ on purpose: an anon key is public by design. The server-side
 * counterpart (`./rm-server`) reads the non-public names for server components.
 *
 * WHEN UNCONFIGURED it returns a stub rather than throwing. The chart builds
 * its client at module scope, so a missing variable would take down the whole
 * dashboard on import — an empty chart is a far better failure than a blank
 * page, and rm-server is not wired yet.
 */

type QueryResult = { data: null; error: { message: string } };

const UNCONFIGURED = {
  message: "rm-server is not configured (NEXT_PUBLIC_RM_SERVER_SUPABASE_URL).",
};

/**
 * Answers the whole builder chain the chart uses — select/eq/order/limit are
 * chainable, maybeSingle and await resolve to an empty result. `then` is what
 * makes a bare `await query` work without calling maybeSingle().
 */
function stubQuery(): Record<string, unknown> {
  const result: QueryResult = { data: null, error: UNCONFIGURED };
  const chain: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: async () => result,
    single: async () => result,
  };
  for (const method of ["select", "eq", "gte", "lte", "order", "limit", "in", "range"]) {
    chain[method] = () => chain;
  }
  return chain;
}

export function createRmServerBrowserClient() {
  const url = process.env.NEXT_PUBLIC_RM_SERVER_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_RM_SERVER_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { from: () => stubQuery() } as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url, key);
}
