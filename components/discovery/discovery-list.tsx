"use client";

import { useMemo, useState } from "react";
import type { LifecycleState } from "@prisma/client";
import { DiscoveryStateBadge } from "./discovery-state-badge";

// Story 1.5 (AC 1, 3, 4, 5; FR2; UX-DR7): the interactive Discovery List.
//
// Client Component (AD-9's one client island for this page) fed entirely by
// server-fetched props — no client-side data fetching, no React Query, no
// API routes. Filter + search run in memory over the rows (≤100 per NFR1),
// so updates are instantaneous and never a page reload (AC 3, 4).
//
// Rows stay non-interactive placeholders — the workspace route arrives with
// Story 2.1, which also replaces the `active` searchParam mechanism with a
// real navigation source.

export type DiscoveryListItem = {
  id: string;
  name: string;
  // Pre-formatted on the server (Intl.DateTimeFormat) — no date logic here.
  createdAtLabel: string;
  updatedAtLabel: string;
  lifecycleState: LifecycleState;
};

const FILTERS: Array<{ value: LifecycleState | "All"; label: string }> = [
  { value: "All", label: "All" },
  { value: "Draft", label: "Draft" },
  { value: "InReview", label: "In Review" },
  { value: "Approved", label: "Approved" },
];

export function DiscoveryList({
  discoveries,
  activeId,
}: {
  discoveries: DiscoveryListItem[];
  activeId?: string;
}) {
  const [stateFilter, setStateFilter] = useState<LifecycleState | "All">("All");
  const [query, setQuery] = useState("");

  // Derived during render (never a state-sync useEffect — lint trap from 1.3).
  // Filter and search combine: both apply at once.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return discoveries.filter((discovery) => {
      if (stateFilter !== "All" && discovery.lifecycleState !== stateFilter) {
        return false;
      }
      if (q && !discovery.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [discoveries, stateFilter, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="discovery-search" className="text-label text-on-surface">
          Search
        </label>
        <input
          id="discovery-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name"
          className="h-10 rounded-sm border border-outline bg-surface px-3 text-body text-on-surface placeholder:text-on-surface-disabled"
        />
      </div>

      <div
        role="group"
        aria-label="Filter by state"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((filter) => {
          const selected = stateFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setStateFilter(filter.value)}
              className={`h-7 rounded-full border px-3 text-body-sm font-medium ${
                selected
                  ? "border-primary bg-primary-container text-on-primary-container"
                  : "border-outline bg-surface text-on-surface"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visible.map((discovery) => {
            // AC 5: the active row is always visible — no hover treatment
            // (DESIGN.md: elevation/state never hides the active state).
            const isActive = discovery.id === activeId;
            return (
              <li
                key={discovery.id}
                className={`rounded-lg border p-6 ${
                  isActive
                    ? "border-primary bg-primary-container"
                    : "border-outline-variant bg-surface hover:bg-hover-overlay"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {/* break-words: the schema allows 100-char names, and a
                        whitespace-free name has no wrap opportunity on its own. */}
                    <h2 className="text-h1 text-on-surface [overflow-wrap:anywhere]">
                      {discovery.name}
                    </h2>
                    <p className="text-caption tabular-nums text-on-surface-variant">
                      Created {discovery.createdAtLabel} · Modified{" "}
                      {discovery.updatedAtLabel}
                    </p>
                  </div>
                  <DiscoveryStateBadge state={discovery.lifecycleState} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        // Filters/search matched nothing — distinct from the page's true
        // empty state (no Discoveries at all), which lives in page.tsx.
        <p className="text-body text-on-surface-variant">No Discoveries match.</p>
      )}
    </div>
  );
}
