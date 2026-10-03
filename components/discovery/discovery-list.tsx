"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { LifecycleState } from "@prisma/client";
import { DeleteDiscoveryDialog } from "./delete-discovery-dialog";
import { DiscoveryStateBadge } from "./discovery-state-badge";

// Story 1.5 (AC 1, 3, 4, 5; FR2; UX-DR7): the interactive Discovery List.
//
// Client Component (AD-9's one client island for this page) fed entirely by
// server-fetched props — no client-side data fetching, no React Query, no
// API routes. Filter + search run in memory over the rows (≤100 per NFR1),
// so updates are instantaneous and never a page reload (AC 3, 4).
//
// Story 2.1: rows navigate to the Discovery workspace (EXPERIENCE.md "Click
// opens workspace"). The `active` searchParam highlight from Story 1.5 stays
// supported for deep links, though nothing sets it anymore.
//
// Story 2.14 (AC 6): Owner-only rows gain a Delete affordance. The card
// chrome (border/padding/hover/active) moved onto the <li> so the button
// sits BESIDE the Link — an interactive inside an interactive is invalid
// HTML and a keyboard trap. Click target: the Link covers the name/meta
// block (the dominant area); the badge + button cluster is not a link.

export type DiscoveryListItem = {
  id: string;
  name: string;
  // Pre-formatted on the server (Intl.DateTimeFormat) — no date logic here.
  createdAtLabel: string;
  updatedAtLabel: string;
  lifecycleState: LifecycleState;
  // Story 2.14: the page resolves this server-side (ownerId === viewer);
  // the raw ownerId never crosses to the client.
  isOwner: boolean;
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
  // Story 2.14: the row whose Delete is confirmed in the dialog island —
  // ONE dialog instance for the whole list (the toast survives the row's
  // unmount; see delete-discovery-dialog.tsx).
  const [deleteTarget, setDeleteTarget] = useState<DiscoveryListItem | null>(
    null,
  );

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
                className={`flex items-start gap-2 rounded-lg border p-6 ${
                  isActive
                    ? "border-primary bg-primary-container"
                    : "border-outline-variant bg-surface hover:bg-hover-overlay"
                }`}
              >
                <Link
                  href={`/discoveries/${discovery.id}`}
                  className="block min-w-0 flex-1"
                >
                  {/* break-words: the schema allows 100-char names, and a
                      whitespace-free name has no wrap opportunity on its own. */}
                  <h2 className="text-h1 text-on-surface [overflow-wrap:anywhere]">
                    {discovery.name}
                  </h2>
                  <p className="text-caption tabular-nums text-on-surface-variant">
                    Created {discovery.createdAtLabel} · Modified{" "}
                    {discovery.updatedAtLabel}
                  </p>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <DiscoveryStateBadge state={discovery.lifecycleState} />
                  {discovery.isOwner ? (
                    // AC 6: visible for the Owner only (non-owners render
                    // nothing, not a disabled button). Icon-only → aria-label
                    // with the discovery named (the 2.13 a11y pattern).
                    <button
                      type="button"
                      aria-label={`Delete ${discovery.name}`}
                      onClick={() => setDeleteTarget(discovery)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface-variant hover:bg-hover-overlay hover:text-on-surface"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
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

      {/* Story 2.14: always mounted (toast survives the row's unmount);
          the modal renders nothing while no row is targeted. */}
      <DeleteDiscoveryDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
