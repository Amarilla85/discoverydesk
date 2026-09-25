import type { LifecycleState } from "@prisma/client";

// Story 1.5 (AC 2, UX-DR21): lifecycle state badge on Discovery List rows.
// Badge anatomy per DESIGN.md: 24px height, 0 8px padding, rounded-full,
// caption font at 500 weight. Colors are the badge-* tokens from Story 1.3.
//
// The enum value is `InReview`; the human label carries the space. Enum keys
// are referenced (not string literals) so a rename fails at compile time.
const BADGES: Record<LifecycleState, { label: string; className: string }> = {
  Draft: {
    label: "Draft",
    className: "bg-badge-draft text-badge-draft-text",
  },
  InReview: {
    label: "In Review",
    className: "bg-badge-in-review text-badge-in-review-text",
  },
  Approved: {
    label: "Approved",
    className: "bg-badge-approved text-badge-approved-text",
  },
};

export function DiscoveryStateBadge({ state }: { state: LifecycleState }) {
  const badge = BADGES[state];
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2 text-caption font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
