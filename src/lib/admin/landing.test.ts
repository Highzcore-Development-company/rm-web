import { describe, expect, it } from "vitest";
import { firstVisibleAdminPath } from "@/lib/admin/landing";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Where an admin lands when the Overview is withheld.
 *
 * The case that matters is the empty one: admin_roles.permissions defaults to
 * an empty array, so "an admin who can open nothing" is a configuration
 * somebody can create by accident. If this returned a path for them the
 * overview would redirect to a page that redirects back.
 */
describe("firstVisibleAdminPath", () => {
  it("is the overview when they can see it", () => {
    expect(firstVisibleAdminPath([...PERMISSIONS])).toBe("/app/admin");
  });

  it("falls to the first section they can open, in sidebar order", () => {
    // Bot comes before users in the nav, so bot.view wins even though this
    // admin holds both.
    expect(firstVisibleAdminPath(["bot.view", "users.view"])).toBe(
      "/app/admin/chart",
    );
  });

  it("sends a users-only admin to users", () => {
    expect(firstVisibleAdminPath(["users.view"])).toBe("/app/admin/users");
  });

  it("sends a finance-only admin to billing", () => {
    expect(firstVisibleAdminPath(["finance.view"])).toBe("/app/admin/billing");
  });

  it("returns null when they can open nothing", () => {
    // The caller must handle this. Returning a path here would send the
    // overview into a redirect loop with itself.
    expect(firstVisibleAdminPath([])).toBeNull();
  });

  it("never returns the overview to somebody without overview.view", () => {
    // The whole point: this is called BECAUSE they lack it.
    const without = PERMISSIONS.filter(
      (p): p is Permission => p !== "overview.view",
    );
    expect(firstVisibleAdminPath(without)).not.toBe("/app/admin");
  });
});
