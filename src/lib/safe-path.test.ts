import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-path";

const FALLBACK = "/app/onboarding";

describe("safeInternalPath", () => {
  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["tab before the second slash", "/\t/evil.com"],
    ["newline before the second slash", "/\n/evil.com"],
    ["dot-dot collapsing to //", "/..//evil.com"],
    ["dot collapsing to //", "/.//evil.com"],
    ["nested dot-dot collapsing to //", "/x/..//evil.com"],
    ["absolute URL", "https://evil.com"],
    ["bare host", "evil.com"],
    ["empty", ""],
    ["null", null],
  ])("falls back for %s", (_label, input) => {
    expect(safeInternalPath(input)).toBe(FALLBACK);
  });

  it("falls back for undefined and honours a custom fallback", () => {
    expect(safeInternalPath(undefined)).toBe(FALLBACK);
    expect(safeInternalPath("//evil.com", "/app/dashboard")).toBe(
      "/app/dashboard",
    );
  });

  it("lets a same-origin path through unchanged", () => {
    expect(safeInternalPath("/app/dashboard?x=1")).toBe("/app/dashboard?x=1");
    expect(safeInternalPath("/app/onboarding")).toBe("/app/onboarding");
  });
});
