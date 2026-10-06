import { describe, expect, it } from "vitest";
import { HDKey } from "@scure/bip32";
import { tronAddressFromXpub, SUBSCRIPTION_BRANCH } from "./tron";

/**
 * A throwaway wallet from a fixed seed. Never used for real funds — it exists
 * so these tests are deterministic without needing the production xpub.
 */
const seed = new Uint8Array(64).fill(7);
const master = HDKey.fromMasterSeed(seed);
const account = master.derive("m/44'/195'/0'");
const XPUB = account.publicExtendedKey;

/** MYPOKER's branch, reproduced here so the collision test is meaningful. */
const MYPOKER_BRANCH = 5;

function addressOnBranch(branch: number, index: number): string {
  const child = account.deriveChild(branch).deriveChild(index);
  const pub = child.publicKey!;
  // Reuse the real implementation's maths by deriving through it where we can;
  // for the foreign branch we only need to know it differs, so compare the
  // public keys rather than reimplementing base58check here.
  return Buffer.from(pub).toString("hex");
}

describe("tron address derivation", () => {
  it("produces a mainnet-shaped address", () => {
    const address = tronAddressFromXpub(XPUB, 0);
    // TRON base58check addresses start with T and are 34 characters.
    expect(address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it("is deterministic", () => {
    // The watcher re-derives addresses it never stored, so same input must
    // always give the same address — this is load-bearing, not cosmetic.
    expect(tronAddressFromXpub(XPUB, 42)).toBe(tronAddressFromXpub(XPUB, 42));
  });

  it("gives every index its own address", () => {
    const addresses = new Set(
      Array.from({ length: 50 }, (_, i) => tronAddressFromXpub(XPUB, i)),
    );
    expect(addresses.size).toBe(50);
  });

  it("does not collide with MYPOKER's branch", () => {
    // The whole reason for branch 7. If this ever fails, two products are
    // issuing the same address and payments cannot be attributed.
    expect(SUBSCRIPTION_BRANCH).not.toBe(MYPOKER_BRANCH);
    for (const index of [0, 1, 47, 1000]) {
      expect(addressOnBranch(SUBSCRIPTION_BRANCH, index)).not.toBe(
        addressOnBranch(MYPOKER_BRANCH, index),
      );
    }
  });

  it("refuses a bad index rather than deriving something arbitrary", () => {
    expect(() => tronAddressFromXpub(XPUB, -1)).toThrow();
    expect(() => tronAddressFromXpub(XPUB, 1.5)).toThrow();
  });
});
