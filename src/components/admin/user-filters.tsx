"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

const STATES = ["active", "grace", "lapsed", "never", "disabled", "deleted"] as const;

/**
 * Search and filter, kept in the URL rather than in component state.
 *
 * An admin who finds something will send the link to someone, and a filter
 * held in memory produces a link that shows a different list when it arrives.
 */
export function UserFilters({
  search,
  status,
}: {
  search: string;
  status: string;
}) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const [term, setTerm] = useState(search);

  function apply(next: { q?: string; status?: string }) {
    const params = new URLSearchParams();
    const q = next.q ?? term;
    const s = next.status ?? status;
    if (q) params.set("q", q);
    if (s) params.set("status", s);
    // Page is dropped deliberately: page 4 of the old result set is rarely
    // page 4 of the new one, and landing on an empty page reads as no results.
    router.push(`/app/admin/users?${params}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply({});
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="min-w-[16rem] flex-1">
        <label htmlFor="q" className="block text-sm font-medium">
          {t("search")}
        </label>
        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
            aria-hidden="true"
          />
          <input
            id="q"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="field-input w-full rounded-lg py-2.5 pl-9 pr-3 text-sm text-fg"
          />
        </div>
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-medium">
          {t("filter")}
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => apply({ status: e.target.value })}
          className="field-input mt-2 rounded-lg px-3 py-2.5 text-sm text-fg"
        >
          <option value="">{t("all")}</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {t(`state.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-lg border border-border px-4 py-2.5 text-sm hover:border-fg-muted"
      >
        {t("search")}
      </button>
    </form>
  );
}
