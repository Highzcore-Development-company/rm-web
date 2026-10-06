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

export type Database = {
  public: {
    Tables: {
      investors: {
        Row: Investor;
        // Status and account are not insertable: the column grants in the
        // migration omit them, so they take their defaults whatever we send.
        Insert: { user_id: string };
        Update: { vantage_account_id?: string | null };
        Relationships: [];
      };
      /**
       * The company site's table, READ ONLY from here. We need `role` to
       * decide who is an admin, because is_admin() in the database reads it
       * and the two must not disagree. We never write to it.
       */
      users: {
        Row: { id: string; email: string | null; role: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      investor_status: InvestorStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
