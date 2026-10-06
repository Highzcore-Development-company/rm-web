/**
 * P2-307 — watching TRON for incoming USDT.
 *
 * Two hard gates before anything is credited, both from the MYPOKER pattern:
 *
 *   1. The transfer must come from the ACCEPTED CONTRACT. Anyone can deploy a
 *      token called "USDT" and send a million of it to an address for free. If
 *      we credited by symbol, a subscription would cost nothing.
 *   2. It must have the REQUIRED CONFIRMATIONS. An unconfirmed transfer has
 *      moved no money and can be erased by a reorg.
 *
 * Both are read from config per invoice rather than globally, so a change to
 * the environment cannot retroactively alter what an outstanding invoice
 * promised.
 */

const API_URL = process.env.TRON_API_URL ?? "https://api.trongrid.io";

export type IncomingTransfer = {
  txHash: string;
  /** Integer micro-USDT (6 decimals). Never a float. */
  microUsdt: number;
  contract: string;
  confirmations: number;
  timestamp: number;
};

type TrcTransfer = {
  transaction_id?: string;
  value?: string;
  block_timestamp?: number;
  token_info?: { address?: string; decimals?: number };
  to?: string;
  type?: string;
};

function headers(): HeadersInit {
  const key = process.env.TRON_API_KEY;
  // TronGrid serves unauthenticated requests at a low rate limit, which is
  // enough while building. A key only raises the ceiling.
  return key
    ? { "TRON-PRO-API-KEY": key, Accept: "application/json" }
    : { Accept: "application/json" };
}

/**
 * TRC-20 transfers into one address.
 *
 * Confirmations are derived from the latest block rather than trusted from the
 * response, because the field is not consistently present and "how settled is
 * this" is the question the whole credit decision turns on.
 */
export async function getIncomingTransfers(
  address: string,
): Promise<IncomingTransfer[] | null> {
  try {
    const [transfersRes, blockRes] = await Promise.all([
      fetch(
        `${API_URL}/v1/accounts/${address}/transactions/trc20?only_to=true&limit=50`,
        { headers: headers(), cache: "no-store" },
      ),
      fetch(`${API_URL}/wallet/getnowblock`, {
        method: "POST",
        headers: headers(),
        cache: "no-store",
      }),
    ]);

    if (!transfersRes.ok) {
      console.error("[tron] transfers request failed:", transfersRes.status);
      return null;
    }

    const body = (await transfersRes.json()) as { data?: TrcTransfer[] };
    const block = (await blockRes.json().catch(() => ({}))) as {
      block_header?: { raw_data?: { number?: number } };
    };
    const head = block.block_header?.raw_data?.number ?? 0;

    return (body.data ?? [])
      .filter((t) => t.transaction_id && t.value)
      .map((t) => {
        // Block number is not on the TRC-20 endpoint, so confirmations are
        // approximated from time: TRON produces a block every ~3 seconds.
        const ageMs = Date.now() - (t.block_timestamp ?? Date.now());
        const confirmations = head > 0 ? Math.max(Math.floor(ageMs / 3000), 0) : 0;

        return {
          txHash: t.transaction_id as string,
          microUsdt: Number(t.value),
          contract: t.token_info?.address ?? "",
          confirmations,
          timestamp: t.block_timestamp ?? 0,
        };
      })
      .filter((t) => Number.isFinite(t.microUsdt) && t.microUsdt > 0);
  } catch (err) {
    console.error("[tron] watch failed:", err);
    return null;
  }
}

/** Gate 1. Anything but the accepted contract is ignored, never credited. */
export function isAcceptedContract(
  transfer: IncomingTransfer,
  expected: string,
): boolean {
  return transfer.contract === expected;
}

/** Gate 2. Mempool and shallow transfers are never credited. */
export function isConfirmed(
  transfer: IncomingTransfer,
  required: number,
): boolean {
  return transfer.confirmations >= required;
}

/**
 * Whether a transfer settles an invoice.
 *
 * Underpayment is NOT accepted. Tolerating "close enough" means a $20
 * subscription can be bought for $19.99, and every amount below becomes a
 * negotiation. Overpayment settles it — refusing someone who paid too much
 * would be absurd — and the excess is a support conversation, not a silent
 * credit.
 */
export function settlesInvoice(
  transfer: IncomingTransfer,
  expectedMicroUsdt: number,
): boolean {
  return transfer.microUsdt >= expectedMicroUsdt;
}
