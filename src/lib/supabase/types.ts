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
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      investor_status: InvestorStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
