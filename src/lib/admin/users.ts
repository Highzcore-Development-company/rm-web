import { createServiceClient } from "@/lib/supabase/service";
import { entitlementFrom } from "@/lib/entitlement";
import type { Investor, Subscription } from "@/lib/supabase/types";

/**
 * A3 + A4 — reading investors for the admin panel.
 *
 * Service role, because an admin needs to see every investor and the RLS on
 * `investors` is written for the investor themselves. The permission check
 * happens before any of this is called — see requirePermission.
 *
 * Email lives in auth.users, which PostgREST will not join to, so it is
 * fetched separately and matched in memory. That is also why search is done
 * the way it is below.
 */

export type AdminUserRow = {
  investorId: string;
  userId: string;
  email: string;
  signedUpAt: string;
  verified: boolean;
  riskAcknowledged: boolean;
  subscription: "active" | "grace" | "lapsed" | "never";
  expiresAt: string | null;
  brokerLinked: boolean;
  vantageAccountId: string | null;
  status: Investor["status"];
  disabledAt: string | null;
  deletedAt: string | null;
  lastSeenAt: string | null;
  /**
   * True when this person also holds a row in app_admins.
   *
   * Named for what it actually is. Being in-house does not make somebody an
   * admin — a social media manager is a colleague with no business in this
   * panel — so this says "is an admin", never "is staff".
   *
   * Admins are invited, and an invited person may also be a customer, so the
   * two overlap. Without the flag a colleague sits in the customer list
   * indistinguishable from someone paying us, which is how a teammate gets
   * chased for a renewal.
   *
   * Derived, never stored: app_admins is the single source of truth, and a
   * second copy would be wrong the first time someone is removed.
   */
  isAdmin: boolean;
};

export type UserListFilter = {
  search?: string;
  /** Matches the derived subscription state, not the raw column. */
  status?: "active" | "grace" | "lapsed" | "never" | "disabled" | "deleted";
  /** "admins" for admins only, "customers" to hide them. Default: both. */
  audience?: "admins" | "customers";
  page?: number;
  perPage?: number;
};

export const DEFAULT_PER_PAGE = 25;

function subscriptionState(subs: Subscription[]): AdminUserRow["subscription"] {
  if (subs.length === 0) return "never";
  const e = entitlementFrom(subs);
  if (e.active) return "active";
  if (e.inGrace) return "grace";
  return "lapsed";
}

export async function listUsers(filter: UserListFilter = {}): Promise<{
  rows: AdminUserRow[];
  total: number;
  page: number;
  perPage: number;
}> {
  const service = createServiceClient();
  const page = Math.max(filter.page ?? 1, 1);
  const perPage = filter.perPage ?? DEFAULT_PER_PAGE;

  // Who is an admin. Fetched before the query rather than after, because
  // filtering by audience has to happen in SQL — filtering the page after it
  // comes back would leave the count and the page size disagreeing with what
  // is on screen.
  const { data: adminRows } = await service.from("app_admins").select("user_id");
  const adminIds = new Set((adminRows ?? []).map((r) => r.user_id as string));

  // A3 says explicitly: do not fetch every investor into the browser. The
  // page of investors is what gets rendered; the lookups below are scoped to
  // that page, so cost does not grow with the size of the book.
  let query = service
    .from("investors")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filter.status === "disabled") query = query.not("disabled_at", "is", null);
  else if (filter.status === "deleted") query = query.not("deleted_at", "is", null);
  // Deleted accounts are hidden unless asked for. They are anonymised rows
  // kept for the money, not people anyone is looking for.
  else query = query.is("deleted_at", null);

  if (filter.audience === "admins") {
    // No admins at all means no rows, not every row — an `in` on an empty list
    // is a filter PostgREST quietly drops.
    query = adminIds.size
      ? query.in("user_id", [...adminIds])
      : query.eq("user_id", "00000000-0000-0000-0000-000000000000");
  } else if (filter.audience === "customers" && adminIds.size) {
    query = query.not(
      "user_id",
      "in",
      `(${[...adminIds].join(",")})`,
    );
  }

  // Searching by email means searching auth.users, which this table cannot
  // join to. The id list comes from there and filters here.
  let searchIds: string[] | null = null;
  if (filter.search?.trim()) {
    const term = filter.search.trim().toLowerCase();
    const { data: accounts } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    searchIds = (accounts?.users ?? [])
      .filter((u) => u.email?.toLowerCase().includes(term))
      .map((u) => u.id);

    if (searchIds.length === 0) {
      return { rows: [], total: 0, page, perPage };
    }
    query = query.in("user_id", searchIds);
  }

  const from = (page - 1) * perPage;
  const { data, count } = await query.range(from, from + perPage - 1);

  const investors = (data ?? []) as Investor[];
  if (investors.length === 0) {
    return { rows: [], total: count ?? 0, page, perPage };
  }

  const ids = investors.map((i) => i.id);
  const { data: subsData } = await service
    .from("subscriptions")
    .select("*")
    .in("investor_id", ids);

  const subsByInvestor = new Map<string, Subscription[]>();
  for (const s of (subsData ?? []) as Subscription[]) {
    subsByInvestor.set(s.investor_id, [
      ...(subsByInvestor.get(s.investor_id) ?? []),
      s,
    ]);
  }

  const { data: accounts } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const accountById = new Map(
    (accounts?.users ?? []).map((u) => [
      u.id,
      { email: u.email ?? "", lastSignIn: u.last_sign_in_at ?? null },
    ]),
  );

  const rows: AdminUserRow[] = investors.map((investor) => {
    const subs = subsByInvestor.get(investor.id) ?? [];
    const entitlement = entitlementFrom(subs);
    const account = accountById.get(investor.user_id);

    return {
      investorId: investor.id,
      userId: investor.user_id,
      // A deleted investor's auth account is anonymised, so there may be no
      // address to show. Saying so is better than an empty cell.
      email: account?.email || (investor.deleted_at ? "(deleted)" : "(unknown)"),
      signedUpAt: investor.created_at,
      verified: Boolean(investor.email_verified_at),
      riskAcknowledged: Boolean(investor.risk_acknowledged_at),
      subscription: subscriptionState(subs),
      expiresAt: entitlement.expiresAt?.toISOString() ?? null,
      isAdmin: adminIds.has(investor.user_id),
      brokerLinked: Boolean(investor.linked_at),
      vantageAccountId: investor.vantage_account_id,
      status: investor.status,
      disabledAt: investor.disabled_at,
      deletedAt: investor.deleted_at,
      lastSeenAt: account?.lastSignIn ?? null,
    };
  });

  // Subscription state is derived, so it cannot be filtered in SQL. Applied
  // after the page is built, which means a filtered page can be short — worth
  // it to keep one definition of "active" rather than two.
  const filtered =
    filter.status && !["disabled", "deleted"].includes(filter.status)
      ? rows.filter((r) => r.subscription === filter.status)
      : rows;

  return { rows: filtered, total: count ?? 0, page, perPage };
}

export type AdminUserDetail = {
  row: AdminUserRow;
  investor: Investor;
  subscriptions: Subscription[];
  disabledByEmail: string | null;
};

/** A4 — one investor, everything about them. */
export async function getUser(investorId: string): Promise<AdminUserDetail | null> {
  const service = createServiceClient();

  const { data: investor } = await service
    .from("investors")
    .select("*")
    .eq("id", investorId)
    .maybeSingle();

  if (!investor) return null;

  const [{ data: subsData }, account, { data: adminRow }] = await Promise.all([
    service
      .from("subscriptions")
      .select("*")
      .eq("investor_id", investorId)
      .order("created_at", { ascending: false }),
    service.auth.admin.getUserById(investor.user_id),
    // One person, so ask about one person rather than reading every admin.
    service
      .from("app_admins")
      .select("user_id")
      .eq("user_id", investor.user_id)
      .maybeSingle(),
  ]);

  const isAdminUser = Boolean(adminRow);

  const subscriptions = (subsData ?? []) as Subscription[];
  const entitlement = entitlementFrom(subscriptions);

  let disabledByEmail: string | null = null;
  if (investor.disabled_by) {
    const { data: actor } = await service.auth.admin.getUserById(
      investor.disabled_by,
    );
    disabledByEmail = actor?.user?.email ?? null;
  }

  return {
    investor: investor as Investor,
    subscriptions,
    disabledByEmail,
    row: {
      investorId: investor.id,
      userId: investor.user_id,
      email: account?.data?.user?.email || "(unknown)",
      signedUpAt: investor.created_at,
      verified: Boolean(investor.email_verified_at),
      riskAcknowledged: Boolean(investor.risk_acknowledged_at),
      subscription: subscriptionState(subscriptions),
      expiresAt: entitlement.expiresAt?.toISOString() ?? null,
      isAdmin: isAdminUser,
      brokerLinked: Boolean(investor.linked_at),
      vantageAccountId: investor.vantage_account_id,
      status: investor.status,
      disabledAt: investor.disabled_at,
      deletedAt: investor.deleted_at,
      lastSeenAt: account?.data?.user?.last_sign_in_at ?? null,
    },
  };
}

/** A3 — the headline count. Excludes soft-deleted rows. */
export async function countUsers(): Promise<number> {
  const service = createServiceClient();
  const { count } = await service
    .from("investors")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  return count ?? 0;
}
