import { describe, expect, it } from "vitest";

/**
 * The scheduled resume, from the dashboard's side.
 *
 * WHAT THIS IS GUARDING. setTradingEnabled() is a server action, which means
 * it is a URL, and the thing on the other end of this one is the only
 * mechanism in the system that turns trading ON by itself. "The form would
 * not let me" is not a guarantee, so the rules live on the server and these
 * pin them.
 *
 * The validation is reproduced here rather than imported because the action
 * is "use server" and pulls in Supabase and next/headers on import. The
 * duplication is the cost of testing the rule at all; if the action changes,
 * this file should fail to describe it and be updated with it.
 */

const MAX_RESUME_DAYS = 14;

type Verdict = { ok: true; resume: string | null } | { ok: false; error: string };

/** Mirrors the guard in app/admin/bot/actions.ts. */
function validateResume(enabled: boolean, resumeAt: string | null, now = Date.now()): Verdict {
  if (enabled || !resumeAt) return { ok: true, resume: null };
  const when = new Date(resumeAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "bad_resume" };
  if (when.getTime() <= now) return { ok: false, error: "resume_past" };
  if (when.getTime() > now + MAX_RESUME_DAYS * 86_400_000) {
    return { ok: false, error: "resume_far" };
  }
  return { ok: true, resume: when.toISOString() };
}

const NOW = Date.UTC(2026, 9, 22, 9, 0, 0);
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

describe("scheduling the bot back on", () => {
  it("accepts a time in the future", () => {
    const v = validateResume(false, inMinutes(60), NOW);
    expect(v).toEqual({ ok: true, resume: new Date(NOW + 3_600_000).toISOString() });
  });

  it("refuses a time that has already passed", () => {
    // It would fire on the bot's very next cycle: the desk stands down and
    // comes straight back up, which is nobody's intention.
    expect(validateResume(false, inMinutes(-1), NOW)).toEqual({
      ok: false,
      error: "resume_past",
    });
  });

  it("refuses now, exactly", () => {
    expect(validateResume(false, new Date(NOW).toISOString(), NOW)).toEqual({
      ok: false,
      error: "resume_past",
    });
  });

  it("refuses a date that is not a date", () => {
    expect(validateResume(false, "next tuesday-ish", NOW)).toEqual({
      ok: false,
      error: "bad_resume",
    });
  });

  it("refuses a schedule further out than two weeks", () => {
    // Not arbitrary: a resume nobody remembers setting, firing a month later
    // into a market nobody has looked at, is worse than the bot being off.
    const v = validateResume(false, inMinutes(15 * 24 * 60), NOW);
    expect(v).toEqual({ ok: false, error: "resume_far" });
  });

  it("allows exactly fourteen days", () => {
    const v = validateResume(false, inMinutes(14 * 24 * 60), NOW);
    expect(v.ok).toBe(true);
  });

  it("treats no schedule as the default, not an error", () => {
    // "Until somebody starts it" has to stay available and has to stay the
    // default — a deadline nobody chose is worse than no deadline.
    expect(validateResume(false, null, NOW)).toEqual({ ok: true, resume: null });
  });

  it("ignores a resume time when the bot is being STARTED", () => {
    // Scheduling a resume for a bot that is already running leaves a trap
    // armed for the next person who stops it.
    const v = validateResume(true, inMinutes(60), NOW);
    expect(v).toEqual({ ok: true, resume: null });
  });
});
