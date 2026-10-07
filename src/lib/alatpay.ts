import { envOr } from "@/lib/env";
/**
 * P2-304 / P2-305 — ALATPay.
 *
 * SERVER ONLY. The key has no NEXT_PUBLIC_ prefix on purpose: the company
 * site's integration is the browser SDK, so its key is public by necessity.
 * Ours is not, and must never acquire that prefix — a NEXT_PUBLIC_ value is
 * inlined into the client bundle and handed to every visitor.
 *
 * We use the virtual-account API, which returns an account NUMBER to display,
 * rather than the popup SDK. The brief is explicit about this. The practical
 * difference: a transfer can be completed from the investor's banking app
 * hours later, with no browser session, and we learn about it by verifying
 * server-side rather than by trusting a callback that fires in a tab.
 *
 * ---------------------------------------------------------------------------
 * THE ENDPOINT SHAPE BELOW IS INFERRED, NOT CONFIRMED.
 *
 * We have credentials but not the virtual-account documentation. The base URL,
 * the auth header and the verification path are known — they are in use on the
 * company site. The create-virtual-account path and its response field names
 * are my best reading of ALATPay's API family.
 *
 * So every response is parsed defensively and, when the fields are not where
 * expected, this returns the raw body rather than guessing. Check the logs on
 * the first real call and correct PATHS below; nothing else should need to
 * change.
 * ---------------------------------------------------------------------------
 */

const API_BASE = envOr(process.env.ALATPAY_API_BASE, "https://apibox.alatpay.ng");

const PATHS = {
  /** Issues a virtual account for one payment. Verify against their docs. */
  createVirtualAccount: "/bank-transfer/api/v1/bankTransfer/virtualAccount",
  /** Known-good: already in use by the company site's verifier. */
  transactions: "/bank-transfer/api/v1/transactions",
  /** Hosted card page. Shape inferred, like createVirtualAccount. */
  createCardPayment: "/card/api/v1/paymentLink",
};

export type VirtualAccount = {
  accountNumber: string;
  /** Resolved from the NIBSS code ALATPay returns, not sent as a name. */
  bankName: string | null;
  /** The raw code, shown when we cannot name it rather than hiding it. */
  bankCode: string | null;
  /** ALATPay's id for this payment. Becomes subscriptions.provider_ref. */
  reference: string;
  expiresAt: string | null;
};

export type AlatPayResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; raw: unknown };

function credentials() {
  const apiKey = process.env.ALATPAY_API_KEY;
  const businessId = process.env.ALATPAY_BUSINESS_ID;
  return apiKey && businessId ? { apiKey, businessId } : null;
}

export function isAlatPayConfigured(): boolean {
  return credentials() !== null;
}

/**
 * NIBSS bank codes to names.
 *
 * ALATPay returns the code and never a name. A payer typing a transfer needs
 * the name, so it is resolved here. 035 is Wema, which is what ALAT issues
 * against — the rest are here because the code is configurable per merchant
 * and a wrong-bank transfer is not recoverable.
 */
const BANK_NAMES: Record<string, string> = {
  "035": "Wema Bank",
  "044": "Access Bank",
  "011": "First Bank of Nigeria",
  "058": "Guaranty Trust Bank",
  "057": "Zenith Bank",
  "033": "United Bank for Africa",
  "214": "First City Monument Bank",
  "070": "Fidelity Bank",
  "232": "Sterling Bank",
  "032": "Union Bank of Nigeria",
  "050": "Ecobank Nigeria",
  "221": "Stanbic IBTC Bank",
  "076": "Polaris Bank",
  "082": "Keystone Bank",
  "023": "Citibank Nigeria",
  "068": "Standard Chartered Bank",
  "030": "Heritage Bank",
  "301": "Jaiz Bank",
  "100": "SunTrust Bank",
  "101": "Providus Bank",
};

/** Pulls the first present value, since the field name is not confirmed. */
function pick(source: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

/**
 * Raises a virtual account for one payment.
 *
 * `amountNgn` is in WHOLE NAIRA, not kobo — ALATPay's amount field is naira,
 * while everything in our own schema is minor units. The conversion happens at
 * this boundary and nowhere else.
 */
export async function createVirtualAccount(input: {
  amountNgn: number;
  orderId: string;
  description: string;
  email: string;
}): Promise<AlatPayResult<VirtualAccount>> {
  const creds = credentials();
  if (!creds) {
    return { ok: false, error: "not_configured", raw: null };
  }

  let body: unknown;
  try {
    const response = await fetch(`${API_BASE}${PATHS.createVirtualAccount}`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": creds.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessId: creds.businessId,
        amount: input.amountNgn,
        currency: "NGN",
        orderId: input.orderId,
        description: input.description,
        customer: { email: input.email },
      }),
      cache: "no-store",
    });

    body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: `http_${response.status}`, raw: body };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network_error",
      raw: null,
    };
  }

  const envelope = body as Record<string, unknown>;
  const data = (envelope.data ?? envelope) as Record<string, unknown>;

  const accountNumber = pick(
    data,
    "virtualBankAccountNumber",
    "accountNumber",
    "virtualAccountNumber",
  );
  const reference = pick(data, "transactionId", "orderId", "reference", "id");

  // ALATPay sends a NIBSS bank code, not a name — the live response carries
  // virtualBankCode "035" and no name field anywhere. There is also no account
  // name: banking apps resolve that from the number themselves.
  const bankCode = pick(data, "virtualBankCode", "bankCode");
  const bankName = bankCode ? (BANK_NAMES[bankCode] ?? null) : null;

  if (bankCode && !bankName) {
    // A code we have not mapped. Logged so it can be added, while the payer
    // still sees the code rather than a blank where the bank should be.
    console.info(`[alatpay] unmapped bank code: ${bankCode}`);
  }

  // Refuse rather than return a half-filled object. An account number we
  // failed to read would be displayed as "null" to someone trying to pay.
  if (!accountNumber || !reference) {
    return { ok: false, error: "unexpected_response_shape", raw: body };
  }

  return {
    ok: true,
    data: {
      accountNumber,
      bankName,
      bankCode,
      reference,
      expiresAt: pick(data, "expiredAt", "expiresAt", "expiryDate"),
    },
  };
}

export type TransactionStatus = "succeeded" | "pending" | "failed";

/**
 * Asks ALATPay what actually happened, server to server.
 *
 * Never trust a client-reported status: the browser can be told anything, and
 * this one decides whether somebody's subscription starts.
 */
export async function verifyTransaction(
  reference: string,
): Promise<AlatPayResult<{ status: TransactionStatus }>> {
  const creds = credentials();
  if (!creds) return { ok: false, error: "not_configured", raw: null };

  try {
    const response = await fetch(
      `${API_BASE}${PATHS.transactions}/${encodeURIComponent(reference)}`,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": creds.apiKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: `http_${response.status}`, raw: body };
    }

    const envelope = body as Record<string, unknown>;
    const data = (envelope.data ?? envelope) as Record<string, unknown>;
    const status = String(
      data.status ?? envelope.status ?? "",
    ).toLowerCase();

    // Anything we do not recognise is NOT success. The default has to fall on
    // the side of not granting access we were not paid for.
    const normalised: TransactionStatus = [
      "completed",
      "success",
      "successful",
      "paid",
    ].includes(status)
      ? "succeeded"
      : ["pending", "processing", "awaiting", "initiated"].includes(status)
        ? "pending"
        : "failed";

    return { ok: true, data: { status: normalised } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network_error",
      raw: null,
    };
  }
}

export type CardPayment = {
  /** Where to send the payer. ALATPay collects the card details, not us. */
  redirectUrl: string;
  /** Becomes subscriptions.provider_ref. */
  reference: string;
};

/**
 * P2-305 — card, through ALATPay's hosted page.
 *
 * Card details never touch this application and never reach our server. That
 * is the entire reason for a hosted flow: handling a PAN ourselves would drag
 * the whole product into PCI scope for no benefit.
 *
 * Card was previously routed through createVirtualAccount, so choosing "Card"
 * produced a bank account number to transfer to — the wrong instrument, with
 * no sign anything was wrong.
 *
 * Endpoint shape is inferred, as with virtual accounts. If the response does
 * not contain a redirect URL this refuses rather than inventing one: sending
 * somebody to an undefined URL is worse than telling them card is unavailable.
 */
export async function createCardPayment(input: {
  amountNgn: number;
  orderId: string;
  description: string;
  email: string;
  returnUrl: string;
}): Promise<AlatPayResult<CardPayment>> {
  const creds = credentials();
  if (!creds) return { ok: false, error: "not_configured", raw: null };

  let body: unknown;
  try {
    const response = await fetch(`${API_BASE}${PATHS.createCardPayment}`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": creds.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessId: creds.businessId,
        amount: input.amountNgn,
        currency: "NGN",
        orderId: input.orderId,
        description: input.description,
        customer: { email: input.email },
        // Where ALATPay returns the payer once they are done. We verify
        // server-side regardless — a redirect proves nothing about payment.
        redirectUrl: input.returnUrl,
        callbackUrl: input.returnUrl,
      }),
      cache: "no-store",
    });

    body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: `http_${response.status}`, raw: body };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network_error",
      raw: null,
    };
  }

  const envelope = body as Record<string, unknown>;
  const data = (envelope.data ?? envelope) as Record<string, unknown>;

  const redirectUrl = pick(
    data,
    "paymentUrl",
    "checkoutUrl",
    "authorizationUrl",
    "link",
    "url",
  );
  const reference = pick(data, "transactionId", "orderId", "reference", "id");

  if (!redirectUrl || !reference) {
    return { ok: false, error: "unexpected_response_shape", raw: body };
  }

  return { ok: true, data: { redirectUrl, reference } };
}
