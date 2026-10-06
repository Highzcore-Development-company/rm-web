/**
 * Types for the tables this app owns. Hand-written rather than generated: the
 * Supabase project is shared with the trading desk and the company site, and a
 * generated file would pull in ~15 tables we must never touch, making it look
 * like they are ours to write to.
 *
 * Mirrors db/migrations/p2_001_investors.sql.
 */

export type InvestorStatus = "pending" | "linked" | "active" | "suspended";

export type Investor = {
  id: string;
  user_id: string;
  /** Set when OUR code was accepted. Supabase auto-confirms, so its flag is not meaningful. */
  email_verified_at: string | null;
  /** P2-104. Server-written, and the RLS policy only allows null -> a value. */
  risk_acknowledged_at: string | null;
  status: InvestorStatus;
  vantage_account_id: string | null;
  linked_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Shaped the way supabase-js expects, including the empty Views/Functions/Enums
 * members. Without them the client cannot resolve the table generics and every
 * .insert() infers `never`.
 */
export type PaymentMethod =
  | "alatpay_transfer"
  | "alatpay_card"
  | "usdt_trc20";

export type SubscriptionStatus =
  | "awaiting"
  | "confirmed"
  | "failed"
  | "expired";

/** Mirrors db/migrations/p2_002_subscriptions.sql. Money in minor units. */
export type Subscription = {
  id: string;
  investor_id: string;
  months: number;
  amount_usd: number;
  amount_ngn: number | null;
  fx_usd_ngn_e6: number | null;
  method: PaymentMethod;
  status: SubscriptionStatus;
  provider_ref: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * What the SERVICE ROLE may write, which is more than an investor may.
 *
 * Modelled as a separate Database type rather than loosened everywhere, so the
 * restriction is enforced by the compiler on the ordinary client and the
 * widening is visible exactly where it is used. Before this, every
 * service-role write needed a @ts-expect-error, which is a comment saying
 * "trust me" in the one place that most deserves checking.
 */
export type ServiceDatabase = {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<
      Database["public"]["Tables"],
      "investors" | "subscriptions" | "api_keys" | "crypto_invoices"
    > & {
      investors: {
        Row: Investor;
        Insert: Partial<Investor> & { user_id: string };
        Update: Partial<Investor>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription> & {
          investor_id: string;
          months: number;
          amount_usd: number;
          method: PaymentMethod;
        };
        Update: Partial<Subscription>;
        Relationships: [];
      };
      api_keys: {
        Row: ApiKey;
        Insert: {
          investor_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
        };
        Update: Partial<Pick<ApiKey, "revoked_at" | "last_used_at" | "name">>;
        Relationships: [];
      };
      crypto_invoices: {
        Row: CryptoInvoice;
        Insert: Omit<
          CryptoInvoice,
          "id" | "status" | "seen_tx_hash" | "seen_micro_usdt" | "seen_at"
          | "created_at" | "expires_at" | "updated_at"
        > & Partial<CryptoInvoice>;
        Update: Partial<CryptoInvoice>;
        Relationships: [];
      };
      email_verifications: {
        Row: {
          user_id: string;
          code_hash: string;
          expires_at: string;
          attempts: number;
          last_sent_at: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          code_hash: string;
          expires_at: string;
          attempts?: number;
          last_sent_at?: string;
        };
        Update: Partial<{ attempts: number; last_sent_at: string }>;
        Relationships: [];
      };
      sent_reminders: {
        Row: { subscription_id: string; milestone: number; sent_at: string };
        Insert: { subscription_id: string; milestone: number };
        Update: never;
        Relationships: [];
      };
    };
  };
};

/** Mirrors the notification_preferences migration. */
export type NotificationPreferences = {
  investor_id: string;
  trade_opened: boolean;
  trade_closed: boolean;
  subscription_expiring: boolean;
  bot_switched_off: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferencesWrite = {
  investor_id: string;
  trade_opened?: boolean;
  trade_closed?: boolean;
  subscription_expiring?: boolean;
  bot_switched_off?: boolean;
};

/** Mirrors the crypto_invoices migration. Amounts in micro-USDT, integer. */
export type CryptoInvoice = {
  id: string;
  subscription_id: string;
  derivation_index: number;
  address: string;
  expected_micro_usdt: number;
  contract: string;
  confirmations_required: number;
  status: "awaiting" | "seen" | "confirmed" | "expired";
  seen_tx_hash: string | null;
  seen_micro_usdt: number | null;
  seen_at: string | null;
  created_at: string;
  expires_at: string;
  updated_at: string;
};

/** Mirrors the api_keys migration. Never carries the plaintext key. */
export type ApiKey = {
  id: string;
  investor_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      investors: {
        Row: Investor;
        // Status and account are not insertable: the column grants in the
        // migration omit them, so they take their defaults whatever we send.
        Insert: { user_id: string };
        Update: {
          vantage_account_id?: string | null;
          risk_acknowledged_at?: string | null;
        };
        Relationships: [];
      };
      /**
       * Admins of highzcore.com. Managed by hand in the Supabase dashboard —
       * there is no in-app grant path on purpose. RLS denies all access to
       * anon and authenticated; only the service role and is_admin() see it.
       */
      app_admins: {
        Row: { user_id: string; note: string | null; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /**
       * Read-only here. Invoices are raised and banked by the service role at
       * a price we calculated — a client that could insert one could insert
       * twelve months for one cent.
       */
      subscriptions: {
        Row: Subscription;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** The one table an investor genuinely owns and writes themselves. */
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: NotificationPreferencesWrite;
        Update: Partial<NotificationPreferencesWrite>;
        Relationships: [];
      };
      /**
       * Read-only. Keys are minted by the service role so a client can never
       * choose the hash it is registering — that would let someone install a
       * key they already knew.
       */
      api_keys: {
        Row: ApiKey;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      api_usage: {
        Row: { api_key_id: string; window_start: string; calls: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      /** Read-only here; raised and credited by the service role only. */
      crypto_invoices: {
        Row: CryptoInvoice;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      /** Service role only. Increments and checks in one statement. */
      record_api_call: {
        Args: { p_key_hash: string; p_limit: number };
        Returns: { allowed: boolean; calls: number; key_id: string | null }[];
      };
      /**
       * Service role only. Banks a payment exactly once and returns the new
       * expiry. Calling it twice with the same reference is safe — that is
       * the point of it.
       */
      activate_subscription: {
        Args: { p_subscription_id: string; p_provider_ref: string };
        Returns: string;
      };
      /** Service role only. Atomically claims an HD derivation index. */
      next_crypto_derivation_index: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      investor_status: InvestorStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
