import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { Receipt } from "./receipt";
import type { Subscription } from "./supabase/types";

const base: Subscription = {
  id: "0f1c9d2e-4b5a-4c6d-8e7f-a1b2c3d4e5f6",
  investor_id: "i",
  months: 3,
  amount_usd: 5700,
  amount_ngn: null,
  fx_usd_ngn_e6: null,
  method: "usdt_trc20",
  status: "confirmed",
  provider_ref: "TX-ABC123",
  starts_at: "2026-06-01T00:00:00Z",
  expires_at: "2026-09-01T00:00:00Z",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

/** A PDF starts with %PDF-. Cheap, and it catches a render that threw. */
function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

describe("receipt", () => {
  it("renders a USD-only receipt", async () => {
    const pdf = await renderToBuffer(Receipt({ subscription: base, email: "a@example.com" }));
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("renders a receipt with an NGN leg", async () => {
    // The naira path has its own branch and its own formatting, so it gets its
    // own render — this is exactly where a template throws in production.
    const pdf = await renderToBuffer(
      Receipt({
        subscription: {
          ...base,
          method: "alatpay_transfer",
          amount_ngn: 8_835_000,
          fx_usd_ngn_e6: 1_550_000_000,
        },
        email: "b@example.com",
      }),
    );
    expect(isPdf(pdf)).toBe(true);
  });

  it("renders when there is no payment reference", async () => {
    const pdf = await renderToBuffer(
      Receipt({
        subscription: { ...base, provider_ref: null },
        email: "c@example.com",
      }),
    );
    expect(isPdf(pdf)).toBe(true);
  });
});
