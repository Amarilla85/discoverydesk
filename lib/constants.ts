import { PhaseState, PhaseType } from "@prisma/client";

/*
 * Story 2.1 — phase flow constants (architecture seed: "Phase enum, state
 * machine rules"). This file is the single source of truth for phase order,
 * names, and the AD-6 phase gate; both the read path (workspace pages) and
 * the write path (actions/phases.ts) call computePhaseLocks — the gate rule
 * is never restated inline.
 *
 * AD-5: exactly the six PhaseType values, in canonical order. Enum values are
 * referenced (not string literals) so a rename fails at compile time.
 */
export const PHASE_ORDER: readonly PhaseType[] = [
  PhaseType.Persona,
  PhaseType.PainGain,
  PhaseType.ValueProp,
  PhaseType.BusinessModel,
  PhaseType.Vision,
  PhaseType.BusinessCase,
];

// Human names (stepper labels, phase headers, gate microcopy).
export const PHASE_NAMES: Record<PhaseType, string> = {
  [PhaseType.Persona]: "Persona",
  [PhaseType.PainGain]: "Pain/Gain",
  [PhaseType.ValueProp]: "Value Proposition",
  [PhaseType.BusinessModel]: "Business Model",
  [PhaseType.Vision]: "Vision",
  [PhaseType.BusinessCase]: "Business Case",
};

// One-line phase descriptions for the workspace phase header (DESIGN.md
// "Phase content area: phase name, phase number, and phase description").
export const PHASE_DESCRIPTIONS: Record<PhaseType, string> = {
  [PhaseType.Persona]: "Understand the customer you are designing for.",
  [PhaseType.PainGain]: "Capture and score the customer's pains and gains.",
  [PhaseType.ValueProp]: "Map your value proposition against the customer profile.",
  [PhaseType.BusinessModel]: "Describe how the business creates, delivers, and captures value.",
  [PhaseType.Vision]: "State the product vision and the problem it solves.",
  [PhaseType.BusinessCase]: "Define success metrics, investment, and key assumptions.",
};

export type PhaseStatesByType = Record<PhaseType, PhaseState>;

// 1-based position of a phase in the canonical order (stepper numbering).
export function phaseNumber(phaseType: PhaseType): number {
  return PHASE_ORDER.indexOf(phaseType) + 1;
}

// Parse a 1-based [phase] URL segment into a PhaseType; null when invalid.
export function phaseFromParam(param: string): PhaseType | null {
  const n = Number(param);
  if (!Number.isInteger(n) || n < 1 || n > PHASE_ORDER.length) return null;
  return PHASE_ORDER[n - 1];
}

// Collapse the Phase rows into a complete state map. A missing row defaults
// to Draft, which keeps the gate conservative (later phases stay locked).
export function buildStateMap(
  phases: ReadonlyArray<{ phaseType: PhaseType; state: PhaseState }>,
): PhaseStatesByType {
  const states = Object.fromEntries(
    PHASE_ORDER.map((phaseType) => [phaseType, PhaseState.Draft]),
  ) as PhaseStatesByType;
  for (const phase of phases) states[phase.phaseType] = phase.state;
  return states;
}

/*
 * AD-6 phase gate, shared by both enforcement paths: phase 1 is never locked;
 * phase N is locked iff phase N-1 is not Approved. A locked phase is hidden
 * from editing but the rule says nothing about visibility — InReview and
 * Approved phases stay viewable, and a Draft phase whose predecessor is
 * Approved is unlocked (navigable, editable).
 */
export function computePhaseLocks(
  states: PhaseStatesByType,
): Record<PhaseType, boolean> {
  const locks = {} as Record<PhaseType, boolean>;
  let predecessorApproved = true; // phase 1 has no predecessor and is never locked
  for (const phaseType of PHASE_ORDER) {
    locks[phaseType] = !predecessorApproved;
    predecessorApproved = states[phaseType] === PhaseState.Approved;
  }
  return locks;
}

// The phase the workspace opens on: the first phase that is not yet Approved
// (the working phase). When everything is Approved, land on phase 1 read-only.
export function defaultPhaseNumber(states: PhaseStatesByType): number {
  const index = PHASE_ORDER.findIndex(
    (phaseType) => states[phaseType] !== PhaseState.Approved,
  );
  return index === -1 ? 1 : index + 1;
}

// Story 2.4 (NFR3, AD-3): collaboration visibility polls every 10 seconds.
// Lives here per the architecture seed ("Phase enum, state machine rules,
// polling interval") — client-importable, so never move it into a "use server"
// module. WebSocket post-MVP replaces the hook, not this value.
export const POLL_INTERVAL_MS = 10_000;
