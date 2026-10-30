import { describe, expect, it } from "vitest";
import { productUrl, rewriteFor, subdomainOf } from "./subdomain";

/**
 * HS-WEB-v1 — the host decides which door a visitor came through.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS. This runs on every request on a
 * live site that is selling today, and highzcore.com has no subdomains — so
 * the only acceptable behaviour on every host we currently serve is to do
 * nothing at all. Page seven: "it does not break what was already working."
 */
describe("subdomain routing", () => {
  it("leaves the live domain completely alone", () => {
    for (const host of [
      "highzcore.com",
      "www.highzcore.com",
      "app.highzcore.com",
      "localhost:3000",
      "rm-web.netlify.app",
      null,
    ]) {
      expect(rewriteFor(host, "/")).toBeNull();
      expect(rewriteFor(host, "/pricing")).toBeNull();
    }
  });

  it("serves each product from its own subdomain", () => {
    expect(rewriteFor("autotrade.highzcore.tech", "/")).toBe("/autotrade");
    expect(rewriteFor("analysis.highzcore.tech", "/")).toBe("/analysis");
    expect(rewriteFor("build.highzcore.tech", "/")).toBe("/build");
    expect(rewriteFor("studio.highzcore.tech", "/")).toBe("/studio");
    expect(rewriteFor("blog.highzcore.tech", "/")).toBe("/blog");
    expect(rewriteFor("docs.highzcore.tech", "/")).toBe("/docs");
  });

  it("sends both platform doors to the SAME place", () => {
    // "One platform, two doors… same dashboard — the permissions decide what
    // shows." Routing them apart would be the start of two platforms.
    expect(rewriteFor("admin.highzcore.tech", "/")).toBe("/app/admin");
    expect(rewriteFor("staff.highzcore.tech", "/")).toBe("/app/admin");
  });

  it("only rewrites the ROOT of a subdomain", () => {
    // Pricing, terms and the app itself are the same pages behind every door.
    // Rewriting them under a product prefix would 404 all of them.
    expect(rewriteFor("autotrade.highzcore.tech", "/pricing")).toBeNull();
    expect(rewriteFor("autotrade.highzcore.tech", "/app/dashboard")).toBeNull();
    expect(rewriteFor("staff.highzcore.tech", "/app/admin/users")).toBeNull();
  });

  it("ignores the root domain itself", () => {
    // The root is its own page, not a product.
    expect(rewriteFor("highzcore.tech", "/")).toBeNull();
    expect(rewriteFor("www.highzcore.tech", "/")).toBeNull();
  });

  it("refuses a subdomain nobody opened rather than guessing", () => {
    // DNS can point anything at us. Inventing a route for an unknown host is
    // how one ends up somewhere it should not be.
    expect(rewriteFor("staging.highzcore.tech", "/")).toBeNull();
    expect(rewriteFor("a.b.highzcore.tech", "/")).toBeNull();
    expect(rewriteFor("notours.com", "/")).toBeNull();
    // And a look-alike must not match on a suffix.
    expect(rewriteFor("evil-highzcore.tech", "/")).toBeNull();
    expect(rewriteFor("highzcore.tech.evil.com", "/")).toBeNull();
  });

  it("reads the host the way a proxy sends it", () => {
    // Case-insensitive, and the port is not part of the name.
    expect(subdomainOf("AUTOTRADE.Highzcore.Tech")).toBe("autotrade");
    expect(subdomainOf("autotrade.highzcore.tech:443")).toBe("autotrade");
    expect(subdomainOf(" docs.highzcore.tech ")).toBe("docs");
  });
});

describe("linking between products", () => {
  it("uses the subdomain once we are on the real domain", () => {
    expect(productUrl("build", "highzcore.tech")).toBe("https://build.highzcore.tech");
    expect(productUrl("studio", "autotrade.highzcore.tech")).toBe(
      "https://studio.highzcore.tech",
    );
  });

  it("stays on the path everywhere the subdomains do not exist", () => {
    // highzcore.com has no subdomains; a preview and localhost have none
    // either. A link to one would be a dead end.
    for (const host of [
      "highzcore.com",
      "www.highzcore.com",
      "localhost:3000",
      "deploy-preview-12--rm-web.netlify.app",
      null,
    ]) {
      expect(productUrl("build", host)).toBe("/build");
    }
  });

  it("does not invent a door for something we never opened", () => {
    expect(productUrl("careers", "highzcore.tech")).toBe("/careers");
  });
});
