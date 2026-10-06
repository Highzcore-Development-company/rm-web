// Checks the TRON side end to end without needing a payment first.
//
//   npm run test:tron                 # config, connectivity, derived addresses
//   npm run test:tron -- TXxxx...     # what our watcher sees at one address
//
// The point is to separate "the chain integration is broken" from "nobody has
// sent anything yet", which look identical from the checkout page.
import { readFileSync } from "node:fs";
import { HDKey } from "@scure/bip32";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^['"]|['"]$/g, ""),
      ];
    }),
);

const {
  TRON_WATCH_XPUB,
  TRON_API_URL = "https://api.trongrid.io",
  TRON_API_KEY,
  USDT_TRC20_CONTRACT,
  DEPOSIT_CONFIRMATIONS = "20",
} = env;

const MAINNET_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BRANCH = 7; // ours; MYPOKER uses 5

function address(xpub, index) {
  const child = HDKey.fromExtendedKey(xpub).deriveChild(BRANCH).deriveChild(index);
  const point = secp256k1.Point.fromBytes(child.publicKey).toBytes(false);
  const hash = keccak_256(point.slice(1));
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(hash.slice(-20), 1);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const out = new Uint8Array(25);
  out.set(payload, 0);
  out.set(checksum, 21);
  return base58.encode(out);
}

const headers = TRON_API_KEY
  ? { "TRON-PRO-API-KEY": TRON_API_KEY, Accept: "application/json" }
  : { Accept: "application/json" };

console.log("network       :", TRON_API_URL);
console.log("contract      :", USDT_TRC20_CONTRACT);
console.log("confirmations :", DEPOSIT_CONFIRMATIONS);

const testnet = TRON_API_URL.includes("nile") || TRON_API_URL.includes("shasta");
console.log(
  "mode          :",
  testnet ? "TESTNET — no real money moves here" : "MAINNET — real funds",
);

if (!testnet && USDT_TRC20_CONTRACT !== MAINNET_USDT) {
  console.warn(
    `\nWARNING: mainnet URL with a non-mainnet contract.\n  expected ${MAINNET_USDT}\nCrediting would be keyed on a token that is not USDT.`,
  );
}
if (testnet && USDT_TRC20_CONTRACT === MAINNET_USDT) {
  console.warn(
    "\nWARNING: testnet URL with the MAINNET contract. Nothing will ever be seen.",
  );
}

if (!TRON_WATCH_XPUB) {
  console.error("\nTRON_WATCH_XPUB is not set.");
  process.exit(1);
}

// Reachability, separate from whether a payment exists.
try {
  const res = await fetch(`${TRON_API_URL}/wallet/getnowblock`, {
    method: "POST",
    headers,
  });
  const block = await res.json();
  const height = block?.block_header?.raw_data?.number;
  console.log("node          : reachable, block", height ?? "(unknown)");
} catch (err) {
  console.error("node          : UNREACHABLE —", err.message);
  process.exit(1);
}

const target = process.argv[2];

if (!target) {
  console.log("\nNext three addresses we would issue:");
  for (let i = 0; i < 3; i += 1) console.log(`  index ${i}: ${address(TRON_WATCH_XPUB, i)}`);
  console.log(
    "\nTo test a real payment:" +
      "\n  1. Install TronLink and switch it to the Nile testnet" +
      "\n  2. Get test TRX for gas from a Nile faucet (needed to send anything)" +
      `\n  3. Get test tokens for ${USDT_TRC20_CONTRACT}` +
      "\n  4. Start a USDT checkout, send the exact amount to the address shown" +
      "\n  5. Press 'I have sent it' and watch the panel" +
      "\n\nThen: npm run test:tron -- <that address>",
  );
  process.exit(0);
}

const res = await fetch(
  `${TRON_API_URL}/v1/accounts/${target}/transactions/trc20?only_to=true&limit=20`,
  { headers },
);
const body = await res.json();
const transfers = body?.data ?? [];

console.log(`\nincoming transfers at ${target}: ${transfers.length}`);

if (transfers.length === 0) {
  console.log(
    "Nothing has arrived. If you have sent something, check the wallet was on" +
      "\nthe same network and the transaction actually confirmed.",
  );
  process.exit(0);
}

for (const t of transfers) {
  const contract = t.token_info?.address ?? "(unknown)";
  const accepted = contract === USDT_TRC20_CONTRACT;
  const ageSeconds = Math.floor((Date.now() - (t.block_timestamp ?? 0)) / 1000);
  const confirmations = Math.max(Math.floor(ageSeconds / 3), 0);

  console.log(`\n  tx            : ${t.transaction_id}`);
  console.log(`  amount        : ${Number(t.value) / 1e6} (${t.value} micro)`);
  console.log(`  contract      : ${contract} ${accepted ? "ACCEPTED" : "IGNORED — not our token"}`);
  console.log(`  confirmations : ~${confirmations} of ${DEPOSIT_CONFIRMATIONS}`);
  console.log(
    `  our verdict   : ${
      !accepted
        ? "ignored, wrong contract"
        : confirmations < Number(DEPOSIT_CONFIRMATIONS)
          ? "seen, still confirming"
          : "would be credited"
    }`,
  );
}
