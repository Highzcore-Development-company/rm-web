import { HDKey } from "@scure/bip32";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";

/**
 * P2-306 — TRC-20 deposit addresses, derived from the account-level PUBLIC
 * xpub.
 *
 * No private key is involved and none belongs in this application. The account
 * xpub is the public key at `m/44'/195'/0'`; our leg is a non-hardened child,
 * so an address can be produced online with no signing power whatsoever.
 * Sweeping the funds later needs the xprv and is a separate process with its
 * own custody.
 *
 * ---------------------------------------------------------------------------
 * WE SHARE MYPOKER'S WALLET, ON A DIFFERENT BRANCH.
 *
 * MYPOKER derives player deposits at `…/5/{index}`. If we used branch 5 too,
 * its index 47 and our index 47 would be the SAME ADDRESS — two unrelated
 * invoices collecting into one address, which cannot be attributed to a payer
 * and is exactly what the unique constraint on crypto_invoices exists to stop.
 *
 * Branch 7 is a different, non-overlapping address space from the same xpub.
 * Same seed, same wallet, same recovery, no coordination needed between the
 * two products, and nothing about MYPOKER changes.
 *
 * If MYPOKER ever adds a branch, it must not be this one.
 * ---------------------------------------------------------------------------
 */

/** TRON address version byte. Mainnet and testnets both use 0x41. */
const TRON_PREFIX = 0x41;

/** Highzcore's branch. MYPOKER owns 5; this must never be set to 5. */
export const SUBSCRIPTION_BRANCH = 7;

/** base58check: payload ‖ first 4 bytes of sha256(sha256(payload)). */
function base58check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const out = new Uint8Array(payload.length + 4);
  out.set(payload, 0);
  out.set(checksum, payload.length);
  return base58.encode(out);
}

/**
 * The TRC-20 address for an invoice index.
 *
 * `m/44'/195'/0'` (the xpub) → `/7/{index}` → secp256k1 public key →
 * keccak256 of the uncompressed point without its 0x04 prefix → last 20 bytes
 * → 0x41 ‖ … → base58check.
 *
 * Deterministic: the same xpub and index always produce the same address,
 * which is what lets the watcher re-derive an address it has never stored.
 */
export function tronAddressFromXpub(
  accountXpub: string,
  index: number,
): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("index must be a non-negative integer");
  }

  const account = HDKey.fromExtendedKey(accountXpub);
  const child = account.deriveChild(SUBSCRIPTION_BRANCH).deriveChild(index);
  if (!child.publicKey) throw new Error("xpub produced no public key");

  // TRON hashes the 64-byte X‖Y, so the leading 0x04 of the uncompressed
  // point is dropped.
  const uncompressed = secp256k1.Point.fromBytes(child.publicKey).toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));

  const address = new Uint8Array(21);
  address[0] = TRON_PREFIX;
  address.set(hash.slice(-20), 1);

  return base58check(address);
}

/**
 * The xpub to derive from. Server-only — it is not a secret in the sense that
 * it cannot spend, but publishing it would let anyone enumerate every address
 * we have ever issued and watch the whole subscription book on chain.
 */
export function getWatchXpub(): string | null {
  return process.env.TRON_WATCH_XPUB || null;
}
