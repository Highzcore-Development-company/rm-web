import { describe, expect, it } from "vitest";
import {
  canResend,
  CODE_LENGTH,
  codeMatches,
  expiryFromNow,
  generateCode,
  hashCode,
  RESEND_COOLDOWN_SECONDS,
} from "./verification";

describe("verification codes", () => {
  it("is always six digits, including when the number is small", () => {
    // A zero-padding bug gives "42" instead of "000042" — the user types what
    // they were sent and is told it is wrong.
    for (let i = 0; i < 300; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
      expect(generateCode()).toHaveLength(CODE_LENGTH);
    }
  });

  it("does not repeat itself over many draws", () => {
    // Not a randomness proof — a canary for someone swapping in a constant or
    // a seeded generator.
    const seen = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(400);
  });

  it("never stores the code itself", () => {
    const code = "123456";
    const hash = hashCode(code);
    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts the right code and rejects everything else", () => {
    const hash = hashCode("123456");
    expect(codeMatches("123456", hash)).toBe(true);
    expect(codeMatches("123457", hash)).toBe(false);
    expect(codeMatches("12345", hash)).toBe(false);
    expect(codeMatches("", hash)).toBe(false);
    // A near-miss on the hash itself must not pass either.
    expect(codeMatches("123456", hash.slice(0, -1) + "0")).toBe(false);
  });

  it("expires in the future, not the past", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const expiry = expiryFromNow(now);
    expect(expiry.getTime()).toBeGreaterThan(now.getTime());
    expect(expiry.getTime() - now.getTime()).toBe(15 * 60_000);
  });

  it("refuses a resend inside the cooldown and allows it after", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const justSent = new Date(now.getTime() - 1000);
    const longAgo = new Date(now.getTime() - (RESEND_COOLDOWN_SECONDS + 1) * 1000);

    expect(canResend(justSent, now)).toBe(false);
    expect(canResend(longAgo, now)).toBe(true);
  });
});
