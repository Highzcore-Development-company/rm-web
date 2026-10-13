/**
 * HS-BOT-v4 §3 — what Scora costs.
 *
 * "Count usage per account. We need to know what a subscriber costs us before
 * we find out the expensive way."
 *
 * Recording the tokens was the easy half and it was already done. This is the
 * half that satisfies the sentence: a number nobody can read does not tell you
 * anything before the bill does.
 *
 * PRICES ARE A SETTING, NOT A FACT. They are what the provider charged when
 * this was written, in USD per million tokens, and they will move. They live in one
 * place with a date on them so a wrong figure is correctable rather than
 * scattered through the code — and so anybody reading a cost knows what it was
 * priced at.
 */

/**
 * USD per MILLION tokens, as listed on 13 October 2026.
 *
 * GROQ is what Scora runs on now. The Qwen rows stay because a cost read back
 * must use the price the tokens were actually bought at — repricing history
 * at today's provider would quietly rewrite last month's figure.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  // Groq
  "llama-3.3-70b-versatile": { in: 0.59, out: 0.79 },
  "llama-3.1-8b-instant": { in: 0.05, out: 0.08 },
  "openai/gpt-oss-120b": { in: 0.15, out: 0.75 },
  "openai/gpt-oss-20b": { in: 0.1, out: 0.5 },
  // Alibaba, for anything answered before the provider changed.
  "qwen-plus": { in: 0.4, out: 1.2 },
  "qwen-turbo": { in: 0.05, out: 0.2 },
  "qwen-max": { in: 1.6, out: 6.4 },
};

/**
 * What we assume for a model not in the table.
 *
 * The current default, so an unlisted Groq model is costed near the truth
 * rather than at a price from a provider we no longer use. Either way the page
 * says it guessed.
 */
const FALLBACK = PRICES["llama-3.3-70b-versatile"];

export type UsageRow = {
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
  conversation_id: string;
};

export type PersonUsage = {
  investorId: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
  /** USD cents, so money stays an integer like everywhere else. */
  costCents: number;
};

export type ScoraUsage = {
  messages: number;
  promptTokens: number;
  completionTokens: number;
  costCents: number;
  /** Cents per paying person, which is the figure the brief actually asks for. */
  costPerPersonCents: number;
  byPerson: PersonUsage[];
  byDay: { date: string; costCents: number; messages: number }[];
  /** Models seen, so a reader knows which prices were applied. */
  models: string[];
  /** True when something used a model we have no price for. */
  hasUnpricedModel: boolean;
};

const EMPTY: ScoraUsage = {
  messages: 0,
  promptTokens: 0,
  completionTokens: 0,
  costCents: 0,
  costPerPersonCents: 0,
  byPerson: [],
  byDay: [],
  models: [],
  hasUnpricedModel: false,
};

/**
 * Cost of one message in USD CENTS, as a float until it is summed.
 *
 * Rounded once at the end rather than per message: a single answer costs a
 * fraction of a cent, and rounding each one to an integer would floor almost
 * every row to zero and report that Scora is free.
 */
function centsFor(row: UsageRow): number {
  const price = (row.model && PRICES[row.model]) || FALLBACK;
  const inTokens = row.prompt_tokens ?? 0;
  const outTokens = row.completion_tokens ?? 0;
  return (
    (inTokens / 1_000_000) * price.in * 100 +
    (outTokens / 1_000_000) * price.out * 100
  );
}

/**
 * Pure, so it can be tested without a database.
 *
 * `owners` maps a conversation to the investor who owns it — the messages
 * table has no investor on it, and joining in SQL would mean a view we would
 * then have to keep in step.
 */
export function summariseUsage(
  rows: UsageRow[],
  owners: Map<string, string>,
): ScoraUsage {
  // Assistant turns only: a user's question costs nothing to generate, and its
  // tokens are already counted inside the next answer's prompt_tokens.
  const billable = rows.filter((r) => r.completion_tokens != null);
  if (billable.length === 0) return EMPTY;

  const perPerson = new Map<string, PersonUsage & { exact: number }>();
  const perDay = new Map<string, { costCents: number; messages: number }>();
  const models = new Set<string>();
  let hasUnpricedModel = false;
  let promptTokens = 0;
  let completionTokens = 0;
  let exactTotal = 0;

  for (const row of billable) {
    const cents = centsFor(row);
    exactTotal += cents;
    promptTokens += row.prompt_tokens ?? 0;
    completionTokens += row.completion_tokens ?? 0;

    if (row.model) {
      models.add(row.model);
      if (!PRICES[row.model]) hasUnpricedModel = true;
    } else {
      hasUnpricedModel = true;
    }

    const investorId = owners.get(row.conversation_id);
    if (investorId) {
      const p = perPerson.get(investorId) ?? {
        investorId,
        messages: 0,
        promptTokens: 0,
        completionTokens: 0,
        costCents: 0,
        exact: 0,
      };
      p.messages += 1;
      p.promptTokens += row.prompt_tokens ?? 0;
      p.completionTokens += row.completion_tokens ?? 0;
      p.exact += cents;
      perPerson.set(investorId, p);
    }

    const date = row.created_at.slice(0, 10);
    const d = perDay.get(date) ?? { costCents: 0, messages: 0 };
    d.costCents += cents;
    d.messages += 1;
    perDay.set(date, d);
  }

  const byPerson = [...perPerson.values()]
    .map(({ exact, ...p }) => ({ ...p, costCents: Math.round(exact) }))
    // Most expensive first: the question this page answers is "who is costing
    // us money", and that person is the reason anybody opened it.
    .sort((a, b) => b.costCents - a.costCents);

  const costCents = Math.round(exactTotal);

  return {
    messages: billable.length,
    promptTokens,
    completionTokens,
    costCents,
    // Per person who actually used it, not per subscriber: dividing by people
    // who have never opened Scora would report a comfortable average that
    // hides what a heavy user costs.
    costPerPersonCents: perPerson.size
      ? Math.round(exactTotal / perPerson.size)
      : 0,
    byPerson,
    byDay: [...perDay.entries()]
      .map(([date, d]) => ({ date, costCents: Math.round(d.costCents), messages: d.messages }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    models: [...models],
    hasUnpricedModel,
  };
}

/** Cents to a readable string. Sub-cent totals say so rather than showing $0.00. */
export function formatCost(cents: number): string {
  if (cents === 0) return "$0.00";
  if (cents < 1) return "under $0.01";
  return `$${(cents / 100).toFixed(2)}`;
}
