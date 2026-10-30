/**
 * Types for the tables this app owns. Hand-written rather than generated: the
 * Supabase project is shared with the trading desk and the company site, and a
 * generated file would pull in ~15 tables we must never touch, making it look
 * like they are ours to write to.
 *
 * Mirrors db/migrations/p2_001_investors.sql.
 */

export type InvestorStatus = "pending" | "linked" | "active" | "suspended";

/**
 * HS-BOT-v4 §1. Two customers, one platform.
 *
 * trader   — buys Scora, places their own trades, has no broker account.
 * investor — the bot trades their own Vantage account. Does not self-serve.
 */
export type AccountType = "trader" | "investor";

export type Investor = {
  id: string;
  user_id: string;
  /** Never null. Which of the two products this account is. */
  account_type: AccountType;

  // ---- The investor application (HS-BOT-v4 item 9) ------------------------
  //
  // All nullable: the form is filled over several visits, because nobody has
  // their RC number and a scan of the certificate of incorporation to hand in
  // one sitting. `submitted_at` is what says it is finished.
  //
  // Only meaningful when account_type is 'investor'. A trader has none of it.
  company_name: string | null;
  /** The only field that uniquely identifies a company. Names are not unique. */
  company_reg_number: string | null;
  company_country: string | null;
  company_state: string | null;
  company_address: string | null;
  company_tax_id: string | null;
  company_nature: string | null;
  company_website: string | null;

  /** The human being we deal with. This is the name the admin user list shows. */
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** False means they relay but cannot instruct; instructing_party names who can. */
  contact_may_instruct: boolean | null;
  instructing_party: string | null;

  /** Minor units, like every amount here. Never a float — this goes on an agreement. */
  intended_amount_usd: number | null;
  source_of_funds: string | null;
  preferred_currency: string | null;
  /** True = open one for them. False = they have one. Null = not asked yet. */
  wants_account_opened: boolean | null;

  /** Storage path, not a file. Null while documents are collected on the call. */
  incorporation_cert_path: string | null;

  /** Same shape as risk_acknowledged_at: RLS permits only null -> a value. */
  management_agreement_at: string | null;
  terms_accepted_at: string | null;

  /**
   * Submitted for review. Null means still being filled in.
   *
   * Submitting activates NOTHING — an admin reviews it and links the broker
   * account, and only then does status become 'linked'.
   */
  submitted_at: string | null;
  /** Set when OUR code was accepted. Supabase auto-confirms, so its flag is not meaningful. */
  email_verified_at: string | null;
  /** P2-104. Server-written, and the RLS policy only allows null -> a value. */
  risk_acknowledged_at: string | null;
  /** A6. Reversible; status_before_disable is what a re-enable restores. */
  disabled_at: string | null;
  disabled_by: string | null;
  disabled_reason: string | null;
  status_before_disable: InvestorStatus | null;
  /** A7. Soft delete — personal data anonymised, money rows kept. */
  deleted_at: string | null;
  deleted_by: string | null;
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

export type PaymentProblem =
  | "underpaid"
  | "wrong_contract"
  | "provider_failed";

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
  provider_account_number: string | null;
  provider_bank_name: string | null;
  provider_account_name: string | null;
  problem: PaymentProblem | null;
  problem_detail: string | null;
  starts_at: string | null;
  expires_at: string | null;
  /** Recorded manual refund. Nets off revenue; does not shorten entitlement. */
  refunded_usd: number | null;
  refunded_at: string | null;
  refunded_reason: string | null;
  refunded_by: string | null;
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
      | "investors"
      | "subscriptions"
      | "api_keys"
      | "crypto_invoices"
      | "app_admins"
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
      app_admins: {
        Row: AppAdmin;
        Insert: Partial<AppAdmin> & { user_id: string };
        Update: Partial<AppAdmin>;
        Relationships: [];
      };
      crypto_invoices: {
        Row: CryptoInvoice;
        Insert: Pick<
          CryptoInvoice,
          | "subscription_id"
          | "address"
          | "expected_micro_usdt"
          | "contract"
          | "confirmations_required"
        > &
          Partial<CryptoInvoice>;
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
      scora_conversations: {
        Row: {
          id: string;
          investor_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { investor_id: string; title?: string | null };
        Update: { title?: string | null; updated_at?: string };
        Relationships: [];
      };
      /** Append-only. No Update type, because nobody may rewrite a transcript. */
      scora_messages: {
        Row: {
          id: number;
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
          prompt_tokens: number | null;
          completion_tokens: number | null;
          model: string | null;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
          prompt_tokens?: number | null;
          completion_tokens?: number | null;
          model?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      /** Directors and anyone over 25% of an investor company (item 9). */
      investor_owners: {
        Row: {
          id: string;
          investor_id: string;
          full_name: string;
          share_percent: number | null;
          is_director: boolean;
          created_at: string;
        };
        Insert: {
          investor_id: string;
          full_name: string;
          share_percent?: number | null;
          is_director?: boolean;
        };
        Update: {
          full_name?: string;
          share_percent?: number | null;
          is_director?: boolean;
        };
        Relationships: [];
      };
      sent_reminders: {
        Row: { subscription_id: string; milestone: number; sent_at: string };
        Insert: { subscription_id: string; milestone: number };
        Update: never;
        Relationships: [];
      };
      /**
       * P2-506. Append-only: the row IS the idempotency guard, so there is
       * nothing to update and Update is never, as with sent_reminders.
       */
      admin_invitations: {
        Row: AdminInvitation;
        Insert: Pick<
          AdminInvitation,
          "email" | "role" | "token_hash" | "invited_by"
        > &
          Partial<AdminInvitation>;
        Update: Partial<AdminInvitation>;
        Relationships: [];
      };
      /** Append-only. Update is never: a sign-in record that can be edited
       *  answers nothing when it matters. */
      admin_logins: {
        Row: {
          id: number;
          user_id: string;
          signed_in_at: string;
          seen_at: string;
        };
        Insert: { user_id: string; signed_in_at: string };
        Update: never;
        Relationships: [];
      };
      sent_notifications: {
        Row: {
          investor_id: string;
          kind: string;
          ref: string;
          sent_at: string;
        };
        Insert: { investor_id: string; kind: string; ref: string };
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

/** Mirrors the admin_roles table. Super admin ignores `permissions` entirely. */
export type AdminRole = {
  name: string;
  label: string;
  permissions: string[];
  is_super: boolean;
  created_at: string;
};

/** Mirrors app_admins after the roles migration. */
export type AppAdmin = {
  user_id: string;
  note: string | null;
  role: string;
  must_change_password: boolean;
  disabled_at: string | null;
  disabled_by: string | null;
  disabled_reason: string | null;
  created_by: string | null;
  last_seen_at: string | null;
  created_at: string;
  /** Staff identity, independent of investors. See the staff_accounts migration. */
  accepted_at: string | null;
  email_verified_at: string | null;
  invited_by: string | null;
  last_login_at: string | null;
  login_count: number;
  /** Profile, captured on the invitation (migration 20261016190000). Every
   *  field is nullable: an invitation nobody could send because a colleague's
   *  state was unknown is a form that gets worked around. */
  full_name: string | null;
  job_title: string | null;
  phone: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  /** Permissions on top of the role. Additive only — see lib/admin.ts. */
  extra_permissions: string[];
};

/** A pending staff invitation. The token is stored hashed, never raw. */
export type AdminInvitation = {
  id: string;
  email: string;
  role: string;
  token_hash: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  /** Profile, captured on the invitation (migration 20261016190000). Every
   *  field is nullable: an invitation nobody could send because a colleague's
   *  state was unknown is a form that gets worked around. */
  full_name: string | null;
  job_title: string | null;
  phone: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  extra_permissions: string[];
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
  problem: PaymentProblem | null;
  problem_detail: string | null;
  problem_at: string | null;
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
      /**
       * HS-WEB-v1 — the start-of-day plan and the end-of-day result.
       *
       * Two tables rather than one, because EOD is answered AGAINST the
       * morning's list rather than written fresh. See the migration.
       */
      /** HS-WEB-v1 — the projects we show the world we have built. */
      /** HS-WEB-v1 — Highscore Studio's work. Video, not case studies. */
      studio_works: {
        Row: {
          id: string;
          title: string;
          client: string | null;
          project_type: string | null;
          summary: string | null;
          media_type: string | null;
          video_url: string | null;
          audio_url: string | null;
          poster_url: string | null;
          sort_order: number;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          client?: string | null;
          project_type?: string | null;
          summary?: string | null;
          media_type?: string | null;
          video_url?: string | null;
          audio_url?: string | null;
          poster_url?: string | null;
          sort_order?: number;
          published?: boolean;
          updated_at?: string;
        };
        Update: {
          title?: string;
          client?: string | null;
          project_type?: string | null;
          summary?: string | null;
          /** Derived from whether a video URL was given — see saveStudioWork. */
          media_type?: string | null;
          video_url?: string | null;
          audio_url?: string | null;
          poster_url?: string | null;
          sort_order?: number;
          published?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      /** HS-WEB-v1 — blog posts and documentation. kind picks the door. */
      posts: {
        Row: {
          id: string;
          kind: string;
          slug: string;
          title: string;
          excerpt: string;
          body_md: string | null;
          cover_image_url: string | null;
          section: string | null;
          author: string | null;
          sort_order: number;
          published: boolean;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          kind: string;
          slug: string;
          title: string;
          excerpt: string;
          body_md?: string | null;
          cover_image_url?: string | null;
          section?: string | null;
          author?: string | null;
          sort_order?: number;
          published?: boolean;
          published_at?: string | null;
          updated_at?: string;
        };
        Update: {
          /** Settable so an update carries the same payload as an insert. */
          kind?: string;
          slug?: string;
          title?: string;
          excerpt?: string;
          body_md?: string | null;
          cover_image_url?: string | null;
          section?: string | null;
          author?: string | null;
          sort_order?: number;
          published?: boolean;
          published_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      portfolio_projects: {
        Row: {
          id: string;
          slug: string;
          title: string;
          client: string | null;
          summary: string;
          body_md: string | null;
          tech_stack: string[];
          category: string | null;
          cover_image_url: string | null;
          images: string[];
          year: number | null;
          external_url: string | null;
          sort_order: number;
          /** False = a draft. Only published rows are public (RLS). */
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          slug: string;
          title: string;
          summary: string;
          client?: string | null;
          body_md?: string | null;
          tech_stack?: string[];
          category?: string | null;
          cover_image_url?: string | null;
          images?: string[];
          year?: number | null;
          external_url?: string | null;
          sort_order?: number;
          published?: boolean;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          title?: string;
          summary?: string;
          client?: string | null;
          body_md?: string | null;
          tech_stack?: string[];
          category?: string | null;
          cover_image_url?: string | null;
          images?: string[];
          year?: number | null;
          external_url?: string | null;
          sort_order?: number;
          published?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_days: {
        Row: {
          id: string;
          user_id: string;
          day: string;
          sod_at: string | null;
          eod_at: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; day: string; note?: string | null };
        Update: {
          sod_at?: string | null;
          eod_at?: string | null;
          note?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_day_items: {
        Row: {
          id: string;
          day_id: string;
          plan: string;
          /** Null = not answered yet, which is NOT the same as "not done". */
          done: boolean | null;
          outcome: string | null;
          position: number;
          created_at: string;
        };
        Insert: { day_id: string; plan: string; position?: number };
        Update: { done?: boolean | null; outcome?: string | null };
        // Declared so the team view can read a day and its items in ONE
        // round trip — without it, PostgREST embedding does not typecheck
        // and the page would need a second query per day.
        Relationships: [
          {
            foreignKeyName: "staff_day_items_day_id_fkey";
            columns: ["day_id"];
            isOneToOne: false;
            referencedRelation: "staff_days";
            referencedColumns: ["id"];
          },
        ];
      };
      investors: {
        Row: Investor;
        // Status and account are not insertable: the column grants in the
        // migration omit them, so they take their defaults whatever we send.
        Insert: { user_id: string; account_type?: AccountType };
        /**
         * EXACTLY THE COLUMN GRANTS, and that is the point of listing them.
         *
         * investors uses column-level grants, so Postgres refuses anything
         * absent from them whatever the policy says. Mirroring that here means
         * the compiler refuses it first, with the column named, instead of a
         * runtime error that arrives as an empty object.
         *
         * status, linked_at and vantage_account_id's confirmation are NOT
         * here: they are how an application becomes a live trading
         * relationship and they belong to the admin who reviews it.
         */
        Update: {
          vantage_account_id?: string | null;
          risk_acknowledged_at?: string | null;
          // The investor application (item 9).
          company_name?: string | null;
          company_reg_number?: string | null;
          company_country?: string | null;
          company_state?: string | null;
          company_address?: string | null;
          company_tax_id?: string | null;
          company_nature?: string | null;
          company_website?: string | null;
          contact_name?: string | null;
          contact_role?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          contact_may_instruct?: boolean | null;
          instructing_party?: string | null;
          intended_amount_usd?: number | null;
          source_of_funds?: string | null;
          preferred_currency?: string | null;
          wants_account_opened?: boolean | null;
          incorporation_cert_path?: string | null;
          management_agreement_at?: string | null;
          terms_accepted_at?: string | null;
          submitted_at?: string | null;
        };
        Relationships: [];
      };
      /**
       * Admins of highzcore.com. Managed by hand in the Supabase dashboard —
       * there is no in-app grant path on purpose. RLS denies all access to
       * anon and authenticated; only the service role and is_admin() see it.
       */
      app_admins: {
        Row: AppAdmin;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      admin_roles: {
        Row: AdminRole;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      admin_audit: {
        Row: {
          id: string;
          actor_user_id: string | null;
          actor_email: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          detail: Record<string, unknown> | null;
          created_at: string;
        };
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
      /** §3. An investor's own Scora threads, gated by can_use_scora(). */
      scora_conversations: {
        Row: {
          id: string;
          investor_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: { investor_id: string; title?: string | null };
        Update: { title?: string | null; updated_at?: string };
        Relationships: [];
      };
      /** Append-only: no Update type, because nobody may rewrite a transcript. */
      scora_messages: {
        Row: {
          id: number;
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
          prompt_tokens: number | null;
          completion_tokens: number | null;
          model: string | null;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          role: "user" | "assistant";
          content: string;
        };
        Update: never;
        Relationships: [];
      };
      /** Directors and anyone over 25% of an investor company (item 9). */
      investor_owners: {
        Row: {
          id: string;
          investor_id: string;
          full_name: string;
          share_percent: number | null;
          is_director: boolean;
          created_at: string;
        };
        Insert: {
          investor_id: string;
          full_name: string;
          share_percent?: number | null;
          is_director?: boolean;
        };
        Update: {
          full_name?: string;
          share_percent?: number | null;
          is_director?: boolean;
        };
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
      can_use_scora: {
        Args: Record<string, never>;
        Returns: boolean;
      };
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
      /** Records an admin action. Actor comes from the session, not an argument. */
      record_admin_action: {
        Args: {
          p_action: string;
          p_target_type: string | null;
          p_target_id: string | null;
          p_detail: Record<string, unknown> | null;
        };
        Returns: undefined;
      };
      /** A6. Reversible; requires a reason and pauses the subscription. */
      disable_investor: {
        Args: { p_investor_id: string; p_reason: string };
        Returns: undefined;
      };
      /** A6. Restores the previous status and gives back the paused time. */
      enable_investor: {
        Args: { p_investor_id: string };
        Returns: undefined;
      };
      /** A7. Anonymises personal data; subscriptions and receipts are kept. */
      soft_delete_investor: {
        Args: { p_investor_id: string };
        Returns: undefined;
      };
      /** True when the caller holds this permission. */
      admin_has: {
        Args: { p_permission: string };
        Returns: boolean;
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
