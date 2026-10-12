import { describe, expect, it } from "vitest";
import { overlayNeedsRebuild } from "./overlay-state";

describe("overlayNeedsRebuild", () => {
  it("rebuilds when an active position closes", () => {
    expect(overlayNeedsRebuild("active", "monitoring")).toBe(true);
  });
  it("rebuilds when a pending order fills", () => {
    expect(overlayNeedsRebuild("ready", "active")).toBe(true);
  });
  it("leaves a pending order alone when it is cancelled", () => {
    expect(overlayNeedsRebuild("ready", "monitoring")).toBe(false);
  });
  it("does nothing while a position stays open", () => {
    expect(overlayNeedsRebuild("active", "active")).toBe(false);
  });
  it("rebuilds when the first state seen is active", () => {
    expect(overlayNeedsRebuild(null, "active")).toBe(true);
  });
  it("does nothing when the first state seen is not active", () => {
    expect(overlayNeedsRebuild(null, "monitoring")).toBe(false);
  });
  it("rebuilds when the state of an active position disappears", () => {
    expect(overlayNeedsRebuild("active", null)).toBe(true);
  });
});
