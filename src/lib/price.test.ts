import { describe, expect, it } from "vitest";
import { formatPrice, priceDigits } from "./price";

/**
 * Prices used to render raw, and that was a LAYOUT bug as much as a
 * correctness one.
 *
 * bot_market_state.level is a mean of recent swing levels, so it arrives with
 * the float error attached — 190.461333333333, eighteen characters. In the
 * pending menu that number sits in a `shrink-0` span, so it could not wrap and
 * could not shrink: it widened the panel past the screen and clipped its own
 * text. On a phone the page could only be read zoomed out.
 */
describe("formatPrice", () => {
  it("rounds a JPY cross to three places", () => {
    // The number from the screenshot that started this.
    expect(formatPrice(190.461333333333)).toBe("190.461");
    expect(formatPrice(110.415333333333)).toBe("110.415");
  });

  it("rounds an ordinary FX pair to five", () => {
    expect(formatPrice(1.2324325)).toBe("1.23243");
    expect(formatPrice(1.87077)).toBe("1.87077");
  });

  it("rounds crypto to two", () => {
    expect(formatPrice(104233.4567)).toBe("104233.46");
  });

  it("never renders more characters than a price needs", () => {
    // The actual regression: length is what broke the layout.
    expect(formatPrice(190.461333333333).length).toBeLessThanOrEqual(8);
  });

  it("renders a missing price as an em dash, never as zero", () => {
    // A zero is a claim about the market; a dash is the absence of one.
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
    expect(formatPrice(Number.NaN)).toBe("—");
  });

  it("still renders a real zero", () => {
    expect(formatPrice(0)).toBe("0.00000");
  });

  it("handles negatives by magnitude, not by sign", () => {
    expect(priceDigits(-110.4)).toBe(3);
    expect(priceDigits(-1.23)).toBe(5);
  });
});
