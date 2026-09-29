import type { ReactNode } from "react";
import { PhaseState } from "@prisma/client";

// Story 2.2 (UX-DR9): the Phase Card — the state-styled container every phase
// editor (Stories 2.5–2.10), read-only view, and In Review sign-off UI (2.11)
// renders inside. Variants come from the phase's state plus the server-computed
// locked flag (computePhaseLocks) — the card is purely presentational and never
// derives gate decisions itself (the gate rule lives in lib/constants.ts and is
// enforced on both paths; AD-6/ARCH-8/ARCH-9).
//
// DESIGN.md phase-card tokens: 2px border, rounded.lg, spacing.6 padding, with
// per-state overrides — active: 2px primary border + a 0 0 0 3px
// primary-container ring; in-review: 2px warning border; approved: 2px success
// border; locked: surface-container background. The active ring is the one
// component-spec exception to the "no elevation as state" rule (DESIGN.md
// specifies the box-shadow explicitly); every other variant stays flat.
//
// Server Component: no state, no hooks, no client JS (AD-9). The card has NO
// click affordance — navigation between phases is the stepper's job (Story 2.1,
// epics AC 5 resolution recorded in the story file), and In Review phases are
// not editable (EXPERIENCE.md Phase Card table, which supersedes the epics AC
// parenthetical). Hover: non-active, non-locked variants get the subtle
// hover-overlay background; the active card gets no hover change ("the active
// state is always visible") and the locked card is not interactive.

export type PhaseCardProps = {
  // The phase's state — decides the border treatment (locked wins over it).
  state: PhaseState;
  // Server-computed via computePhaseLocks (lib/constants.ts); passed in, never
  // re-derived here.
  locked: boolean;
  // True when this card is the phase currently rendered in the content area.
  // Only affects the Draft state: a viewed, editable Draft phase shows the
  // active indicator (primary border + primary-container ring). In Review and
  // Approved phases keep their own state borders.
  active?: boolean;
  children: ReactNode;
  className?: string;
};

type PhaseCardVariant = "draft" | "active" | "in-review" | "approved" | "locked";

// Presentation-only mapping — keep this in the component file, NOT in
// lib/constants.ts, which owns the gate rule.
function visualVariant(
  state: PhaseState,
  locked: boolean,
  active: boolean,
): PhaseCardVariant {
  if (locked) return "locked";
  if (state === PhaseState.InReview) return "in-review";
  if (state === PhaseState.Approved) return "approved";
  return active ? "active" : "draft";
}

// DESIGN.md phase-card / phase-card-active / -completed / -locked tokens, as
// Tailwind utilities from the Story 1.3 token layer. Locked keeps the
// outline-variant border but swaps the fill to surface-container; the hover
// overlay (EXPERIENCE.md: "Hover (non-active state)") applies to non-active,
// non-locked variants only, with the ≤200ms motion rule (motion-reduce off).
const BASE_STYLES = "rounded-lg border-2 p-6";

const VARIANT_STYLES: Record<PhaseCardVariant, string> = {
  draft:
    "border-outline-variant bg-surface hover:bg-hover-overlay transition-colors duration-150 motion-reduce:transition-none",
  active:
    "border-primary bg-surface shadow-[0_0_0_3px_var(--primary-container)]",
  "in-review":
    "border-warning bg-surface hover:bg-hover-overlay transition-colors duration-150 motion-reduce:transition-none",
  approved:
    "border-success bg-surface hover:bg-hover-overlay transition-colors duration-150 motion-reduce:transition-none",
  locked: "border-outline-variant bg-surface-container",
};

export function PhaseCard({
  state,
  locked,
  active = false,
  children,
  className,
}: PhaseCardProps) {
  const variant = visualVariant(state, locked, active);
  return (
    <section className={`${BASE_STYLES} ${VARIANT_STYLES[variant]}${className ? ` ${className}` : ""}`}>
      {children}
    </section>
  );
}
