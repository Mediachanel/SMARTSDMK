"use client";

import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

export default function SearchFilterBar({ search, filters = [], actions, compact = false }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = filters.filter((filter) => filter.value).length;
  const hasFilters = filters.length > 0;

  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4"}`}>
      <div className="grid gap-3">
        {search ? (
          <label className="relative min-w-0 sm:hidden">
            <span className="sr-only">{search.label || "Cari"}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input h-10 pl-9 text-sm"
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder || "Cari data..."}
              aria-label={search.label || "Cari"}
            />
          </label>
        ) : null}
        <div className="flex justify-end sm:hidden">
          {hasFilters ? (
            <button
              className="btn-secondary h-10 shrink-0 px-3 sm:hidden"
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filter{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          ) : null}
        </div>
        {actions ? <div className="grid sm:hidden">{actions}</div> : null}
        <div className={`${filtersOpen ? "grid" : "hidden"} gap-2 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] xl:items-end`}>
          {search ? (
            <label className="relative hidden min-w-0 sm:block">
              <span className={`section-label mb-2 hidden ${compact ? "" : "sm:block"}`}>{search.label || "Cari"}</span>
              <Search className={`pointer-events-none absolute left-3 h-4 w-4 text-slate-400 ${compact ? "top-3" : "top-[42px]"}`} />
              <input
                className={`input h-10 pl-9 text-sm ${compact ? "" : "sm:h-12"}`}
                type="search"
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder || "Cari data..."}
                aria-label={search.label || "Cari"}
              />
            </label>
          ) : null}
          {filters.map((filter) => (
            <label key={filter.name} className="min-w-0">
              <span className={`section-label mb-2 hidden ${compact ? "" : "sm:block"}`}>{filter.label}</span>
              <select className={`input h-10 text-sm ${compact ? "" : "sm:h-12"}`} value={filter.value} onChange={(event) => filter.onChange(event.target.value)} aria-label={filter.label}>
                <option value="">{filter.label}</option>
                {filter.options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
          {actions ? <div className="hidden sm:self-end sm:block">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
