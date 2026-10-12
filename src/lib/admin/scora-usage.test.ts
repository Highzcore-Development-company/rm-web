import { describe, expect, it } from "vitest";
import {
  formatCost,
  summariseUsage,
  type UsageRow,
} from "@/lib/admin/scora-usage";

/**
 * The rounding is the reason these exist.
 *
 * One Scora answer costs a fraction of a cent. Round each message to an
 * integer and almost every row floors to zero, and the page reports that the
 * product is free — right up until the bill arrives, which is the exact
 * outcome "know what a subscriber costs us" is meant to prevent.
 */

function row(over: Partial<UsageRow> = {}): UsageRow {
  return {
    model: "qwen-plus",
    prompt_tokens: 1_000,
    completion_tokens: 500,
    created_at: "2026-10-12T10:00:00Z",
    conversation_id: "c1",
    ...over,
  };
}

const owners = new Map([["c1", "investor-a"], ["c2", "investor-b"]]);

describe("summariseUsage", () => {
  it("is empty when nothing has been answered", () => {
    expect(summariseUsage([], owners).costCents).toBe(0);
  });

  it("ignores user turns, which cost nothing to generate", () => {
    const s = summariseUsage(
      [row({ completion_tokens: null, prompt_tokens: null })],
      owners,
    );
    expect(s.messages).toBe(0);
  });

  it("does not floor a cheap message to zero across many messages", () => {
    // 1k in + 500 out on qwen-plus is 0.04 + 0.06 = 0.1 cents. A hundred of
    // them is 10 cents — and would be $0.00 if each were rounded first.
    const s = summariseUsage(Array.from({ length: 100 }, () => row()), owners);
    expect(s.costCents).toBe(10);
  });

  it("prices input and output separately", () => {
    // Output is 3x input on qwen-plus, so the same token count costs more.
    const inOnly = summariseUsage(
      [row({ prompt_tokens: 1_000_000, completion_tokens: 0 })],
      owners,
    );
    const outOnly = summariseUsage(
      [row({ prompt_tokens: 0, completion_tokens: 1_000_000 })],
      owners,
    );
    expect(inOnly.costCents).toBe(40);
    expect(outOnly.costCents).toBe(120);
  });

  it("splits by person, most expensive first", () => {
    const s = summariseUsage(
      [
        row({ conversation_id: "c1", completion_tokens: 1_000_000 }),
        row({ conversation_id: "c2", completion_tokens: 10 }),
      ],
      owners,
    );
    expect(s.byPerson[0].investorId).toBe("investor-a");
    expect(s.byPerson).toHaveLength(2);
  });

  it("averages over people who used it, not everyone who could", () => {
    // One heavy user and one light one average to the midpoint. Dividing by
    // every subscriber instead would report a comfortable number that hides
    // what the heavy user actually costs.
    const s = summariseUsage(
      [
        row({ conversation_id: "c1", prompt_tokens: 0, completion_tokens: 1_000_000 }),
        row({ conversation_id: "c2", prompt_tokens: 0, completion_tokens: 0 }),
      ],
      owners,
    );
    expect(s.costPerPersonCents).toBe(60);
  });

  it("flags a model it has no price for, rather than quietly guessing", () => {
    const s = summariseUsage([row({ model: "qwen-future" })], owners);
    expect(s.hasUnpricedModel).toBe(true);
    // Still counted, using the fallback — a cost we cannot price exactly is
    // closer to the truth than leaving it out of the total entirely.
    expect(s.messages).toBe(1);
  });

  it("groups by day, newest first", () => {
    const s = summariseUsage(
      [
        row({ created_at: "2026-10-10T09:00:00Z" }),
        row({ created_at: "2026-10-12T09:00:00Z" }),
      ],
      owners,
    );
    expect(s.byDay.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-10"]);
  });

  it("drops a message whose conversation has no known owner from the split", () => {
    // It still counts towards the total — the money was spent either way.
    const s = summariseUsage([row({ conversation_id: "gone" })], owners);
    expect(s.byPerson).toHaveLength(0);
    expect(s.messages).toBe(1);
  });
});

describe("formatCost", () => {
  it("says 'under $0.01' rather than showing $0.00 for real spending", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.4)).toBe("under $0.01");
    expect(formatCost(250)).toBe("$2.50");
  });
});
