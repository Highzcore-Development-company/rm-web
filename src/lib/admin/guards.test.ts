import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * Victor: "verify all the admin permissions and roles are working — for
 * instance I disable an admin from seeing the overview."
 *
 * Clicking through every role on every page answers that once. This answers it
 * on every commit, which is the version that keeps being true: it reads the
 * admin panel's source and fails if any page or server action is reachable
 * without naming a permission.
 *
 * It caught three when it was written — the link-claims page, confirming a
 * broker link, and rechecking a payment were all behind `isAdmin()`, which
 * means "any admin at all". Confirming a link is what makes an investor's
 * account tradeable, and support could do it.
 *
 * WHAT THIS CANNOT DO: prove the permission is the RIGHT one. A page guarded
 * by the wrong permission passes here. It proves only that nothing is guarded
 * by merely being signed in — which is the failure that keeps happening,
 * because `isAdmin()` reads like a permission and is not one.
 */

const PANEL = join(process.cwd(), "src/app/(app)/app/admin/(panel)");

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, match));
    else if (match(entry)) out.push(full);
  }
  return out;
}

/**
 * Pages that legitimately need no permission beyond being an admin.
 *
 * An ALLOWLIST rather than a looser rule, so adding to it is a deliberate act
 * somebody has to justify in a diff — which is the point. A rule that
 * auto-detected "own data only" would quietly excuse a page the day it started
 * reading somebody else's.
 */
const SELF_ONLY: Record<string, string> = {
  "profile/page.tsx":
    "Your own admin profile, scoped to admin.userId. Every admin has one and " +
    "nobody else's is reachable from it.",
};

const pages = filesUnder(PANEL, (n) => n === "page.tsx");
const actions = filesUnder(PANEL, (n) => n === "actions.ts");

/** Named permissions in a file, so a typo'd one is not mistaken for a guard. */
function permissionsNamed(source: string): string[] {
  return PERMISSIONS.filter((p) => source.includes(`"${p}"`));
}

describe("every admin page names a permission", () => {
  it("found the admin panel", () => {
    // If the folder ever moves, these tests would silently pass on an empty
    // list and prove nothing at all.
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(
    // Separators normalised: this runs on Windows and in CI, and a key that
    // matches on one and not the other is a test that passes by accident.
    pages.map((f) => [f.slice(PANEL.length + 1).split(sep).join("/"), f]),
  )("%s", (label, file) => {
    const source = readFileSync(file, "utf8");

    if (SELF_ONLY[label]) {
      // Still must not reach for "any admin": the exception is about not
      // needing a PERMISSION, not about being unguarded.
      expect(source).toMatch(/getAdmin\(\)/);
      expect(source).not.toMatch(/await isAdmin\(\)/);
      return;
    }

    // The overview is the case Victor named, and it is deliberate: every admin
    // may open it, and each SECTION inside is gated separately — the bot
    // figures on bot.view, the money on finance.view. So it must still name
    // permissions, just not one for the whole page.
    expect(permissionsNamed(source).length).toBeGreaterThan(0);

    // "Any admin" is not a permission. This is the specific regression.
    expect(source).not.toMatch(/await isAdmin\(\)/);
  });
});

describe("every admin server action names a permission", () => {
  it.each(actions.map((f) => [f.slice(PANEL.length + 1), f]))(
    "%s",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/requirePermission\(/);
      expect(source).not.toMatch(/await isAdmin\(\)/);
    },
  );
});
