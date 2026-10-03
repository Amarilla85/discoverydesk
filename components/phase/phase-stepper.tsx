"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PhaseState, type PhaseType } from "@prisma/client";
import { PHASE_NAMES, phaseNumber } from "@/lib/constants";

// Story 2.1 (FR4; UX-DR8): the 6-phase stepper — the workspace's primary task
// flow nav. Six 32px circles connected by 2px lines, labels beneath, states:
// completed (green + checkmark), active (blue + number), in-review (yellow),
// locked (gray, 0.4 opacity). Locked phases never navigate; clicking one
// shows the tooltip "Complete {phase_name} first." (AC 5). The active circle
// grows 32→36px on hover (AC 4); the transition respects prefers-reduced-motion.
//
// Client Component: needs tooltip state and Link navigation. All data is
// server-computed (phase states + locked flags via computePhaseLocks) — the
// stepper renders it, it never derives gate decisions (the gate rule lives in
// lib/constants.ts and is enforced server-side on both paths).
//
// State words for screen readers follow the EXPERIENCE.md accessibility floor:
// aria-label="Phase {N}: {phase name}, {state}".

export type StepperPhase = {
  phaseType: PhaseType;
  state: PhaseState;
  locked: boolean;
};

type StepperVisualState = "completed" | "active" | "in-review" | "locked";

// Stepper visual state from phase state + lock: Approved → completed,
// InReview → in-review, Draft unlocked → active, Draft locked → locked.
// The gate guarantees at most one active (editable Draft) phase exists.
function visualState(phase: StepperPhase): StepperVisualState {
  if (phase.state === PhaseState.Approved) return "completed";
  if (phase.state === PhaseState.InReview) return "in-review";
  return phase.locked ? "locked" : "active";
}

const STATE_LABELS: Record<StepperVisualState, string> = {
  completed: "completed",
  active: "active",
  "in-review": "in review",
  locked: "locked",
};

// DESIGN.md stepper-item-* tokens, as Tailwind utilities from the Story 1.3
// token layer. Locked is a fill color + disabled text + 0.4 opacity.
const CIRCLE_STYLES: Record<StepperVisualState, string> = {
  completed: "bg-success text-success-foreground",
  active: "bg-primary text-primary-foreground",
  "in-review": "bg-warning text-warning-foreground",
  locked: "bg-outline-variant text-on-surface-disabled opacity-40",
};

export function PhaseStepper({
  discoveryId,
  phases,
  currentPhaseType,
}: {
  discoveryId: string;
  // All six phases in PHASE_ORDER order, with server-computed locked flags.
  phases: StepperPhase[];
  // The phase currently rendered in the content area (aria-current target).
  currentPhaseType: PhaseType;
}) {
  return (
    <nav aria-label="Discovery phases">
      <ol className="flex items-start">
        {phases.map((phase, index) => {
          const number = phaseNumber(phase.phaseType);
          const state = visualState(phase);
          const name = PHASE_NAMES[phase.phaseType];
          const isActive = phase.phaseType === currentPhaseType;
          return (
            <Fragment key={phase.phaseType}>
              {/* Connector line between circles — its look follows the
                  phase BEFORE it (DESIGN.md: completed line is solid success;
                  the active line is the one allowed gradient, 50/50 split). */}
              {index > 0 ? <StepperLine predecessor={phases[index - 1]} /> : null}
              <li className="flex min-w-0 flex-col items-center gap-2">
                {phase.locked ? (
                  <LockedPhaseItem number={number} name={name} />
                ) : (
                  <Link
                    href={`/discoveries/${discoveryId}/phases/${number}`}
                    aria-label={`Phase ${number}: ${name}, ${STATE_LABELS[state]}`}
                    aria-current={state === "active" ? "step" : undefined}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-body font-semibold ${CIRCLE_STYLES[state]}${
                      state === "active"
                        ? " transition-all duration-150 motion-reduce:transition-none hover:h-9 hover:w-9"
                        : ""
                    }`}
                  >
                    {state === "completed" ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      number
                    )}
                  </Link>
                )}
                <span className="text-center text-body-sm leading-tight text-on-surface">
                  {name}
                </span>
                {isActive ? <span className="sr-only">(current phase)</span> : null}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

// 2px connector line between circles, vertically centered on the 32px circle.
function StepperLine({ predecessor }: { predecessor: StepperPhase }) {
  const predecessorState = visualState(predecessor);
  return (
    <li aria-hidden="true" className="mx-1 mt-4 h-0.5 min-w-4 flex-1">
      {predecessorState === "completed" ? (
        <div className="h-full bg-success" />
      ) : predecessorState === "active" ? (
        <div
          className="h-full"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--success) 50%, var(--outline-variant) 50%)",
          }}
        />
      ) : (
        <div className="h-full bg-outline-variant" />
      )}
    </li>
  );
}

// Locked step: a non-navigable button. Click shows the tooltip (no navigation,
// AC 5); it hides on mouse leave, blur, or Escape (Story 2.13, UX-DR26 —
// focus stays on the button, so keyboard users can dismiss without tabbing
// away). Hand-rolled (click-triggered — a hover-only tooltip library does not
// match the AC) with the DESIGN.md tooltip tokens: on-surface fill, surface
// text, rounded-sm, caption-sm, level-2 shadow. Known MVP-baseline limit
// (deferred with the post-MVP AA audit): the tooltip is transient and not
// aria-describedby-associated — the button's own aria-label already carries
// the "locked" state word for screen readers.
function LockedPhaseItem({ number, name }: { number: number; name: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onBlur={() => setShowTooltip(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setShowTooltip(false);
        }}
        aria-disabled="true"
        aria-label={`Phase ${number}: ${name}, locked`}
        className={`flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full text-body font-semibold ${CIRCLE_STYLES.locked}`}
      >
        {number}
      </button>
      {showTooltip ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-on-surface px-2 py-1 text-caption-sm text-surface shadow-level-2"
        >
          Complete {name} first.
        </span>
      ) : null}
    </span>
  );
}
