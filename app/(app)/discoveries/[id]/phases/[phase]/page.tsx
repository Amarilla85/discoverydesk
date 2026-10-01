import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PhaseState, PhaseType } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import {
  PhaseStepper,
  type StepperPhase,
} from "@/components/phase/phase-stepper";
import { PhaseCard } from "@/components/phase/phase-card";
import { PhaseEditor } from "@/components/phase/phase-editor";
import { auth } from "@/lib/auth";
import {
  PHASE_DESCRIPTIONS,
  PHASE_NAMES,
  PHASE_ORDER,
  buildStateMap,
  computePhaseLocks,
  defaultPhaseNumber,
  phaseFromParam,
  phaseNumber,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
  isEmptyValueProp,
  normalizeValuePropOutput,
  seedValuePropFromPrior,
} from "@/lib/schemas/value-prop";

// Story 2.1: the workspace phase view — stepper (FR4, UX-DR8) above a phase
// content area, with the AD-6 phase gate enforced here on the READ path
// (ARCH-9): a locked phase's content is never rendered, no matter how the
// URL was reached. The write path enforces the same rule in actions/phases.ts
// (ARCH-8); both call computePhaseLocks in lib/constants.ts.
//
// NFR9 page gate + access: no session → sign-in redirect; the
// owner-or-collaborator filter is the real access check — a Discovery the
// user cannot see is indistinguishable from one that does not exist
// (notFound, never a 403 that leaks existence).
export default async function PhasePage({
  params,
}: {
  params: Promise<{ id: string; phase: string }>;
}) {
  const { id, phase } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  const phaseType = phaseFromParam(phase);
  if (!phaseType) notFound();

  const discovery = await prisma.discovery.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    },
    select: {
      name: true,
      // Story 2.3: the viewed phase's output seeds the auto-saving editor;
      // other phases only need type + state for the stepper/gate.
      phases: { select: { phaseType: true, state: true, output: true } },
    },
  });
  if (!discovery) notFound();

  const states = buildStateMap(discovery.phases);
  const locks = computePhaseLocks(states);
  const number = phaseNumber(phaseType);
  const name = PHASE_NAMES[phaseType];
  // Story 2.3: the viewed phase's persisted output (null on a fresh phase).
  const currentOutput =
    discovery.phases.find((p) => p.phaseType === phaseType)?.output ?? null;
  // Story 2.7 (FR-9 pre-population): while the persisted Phase 3 output is
  // still empty — a fresh phase, or a legacy `{ notes }` scaffold that
  // normalizes to empty — the editor seeds from the completed Persona (jobs)
  // and Pain/Gain (gains, pains) outputs. The seed is a MOUNT-TIME seed, not
  // a write: it arrives as the ordinary initialOutput, so nothing persists
  // until the BA's first edit (auto-save only fires on change), and once
  // Phase 3 holds ANY item the persisted output wins entirely (never
  // re-seeds). Composition happens here at the server level — PhaseEditor
  // and useAutoSave are untouched.
  let editorOutput: unknown = currentOutput;
  if (phaseType === PhaseType.ValueProp) {
    const normalizedCurrent = normalizeValuePropOutput(currentOutput);
    if (isEmptyValueProp(normalizedCurrent)) {
      const personaOutput =
        discovery.phases.find((p) => p.phaseType === PhaseType.Persona)
          ?.output ?? null;
      const painGainOutput =
        discovery.phases.find((p) => p.phaseType === PhaseType.PainGain)
          ?.output ?? null;
      editorOutput = seedValuePropFromPrior(personaOutput, painGainOutput);
    }
  }
  const availableNumber = defaultPhaseNumber(states);
  const availableType = PHASE_ORDER[availableNumber - 1];
  // The blocking phase for a locked phase N is its predecessor (N-1); phase 1
  // is never locked, so the -2 index is always valid here.
  const predecessorName = PHASE_NAMES[PHASE_ORDER[number - 2]];

  const stepperPhases: StepperPhase[] = PHASE_ORDER.map((phaseType) => ({
    phaseType,
    state: states[phaseType],
    locked: locks[phaseType],
  }));

  return (
    <AppShell discoveryName={discovery.name}>
      {/* Stepper is sticky below the top bar (h-14) with the sticky bottom-edge
          shadow (DESIGN.md); -mx-6/px-6 lets its background span the main column. */}
      <div className="sticky top-14 z-30 -mx-6 bg-surface px-6 pb-3 pt-1 shadow-sticky">
        <PhaseStepper
          discoveryId={id}
          phases={stepperPhases}
          currentPhaseType={phaseType}
        />
      </div>

      {locks[phaseType] ? (
        // ARCH-9: blocked read path — no phase output is rendered; the message
        // directs the user to the current available phase (EXPERIENCE.md
        // locked-phase microcopy, UX-DR25). Story 2.2: the panel is now the
        // Phase Card's locked variant (surface-container fill). The helper
        // link stays interactive — it is blocked-state messaging, not phase
        // content, so the card gets no pointer-events-none.
        <PhaseCard state={states[phaseType]} locked>
          <p className="text-body text-on-surface">
            Complete and get sign-off for {predecessorName} before editing the
            next phase.
          </p>
          <Link
            href={`/discoveries/${id}/phases/${availableNumber}`}
            className="mt-4 inline-block rounded-sm text-body-sm text-primary underline underline-offset-2"
          >
            Go to {PHASE_NAMES[availableType]}
          </Link>
        </PhaseCard>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <p className="text-caption tabular-nums text-on-surface-variant">
              Phase {number} of {PHASE_ORDER.length}
            </p>
            <h1 className="text-display-sm text-on-surface">{name}</h1>
            <p className="text-body text-on-surface-variant">
              {PHASE_DESCRIPTIONS[phaseType]}
            </p>
          </header>
          {/* Story 2.1 shipped the navigation and the gate; Story 2.2 the card
              (UX-DR9) — the viewed phase is always the "active" card. Story 2.3
              puts the auto-saving editor inside it for Draft phases (FR6,
              NFR2): the scaffolding Notes editor persists to Phase.output and
              the per-phase forms of Stories 2.5–2.10 will replace its surface.
              In Review / Approved phases stay read-only (EXPERIENCE.md phase
              state machine — In Review is not editable), so they keep the
              placeholder paragraph until their read-only views arrive. */}
          <PhaseCard state={states[phaseType]} locked={false} active className="mt-8">
            {states[phaseType] === PhaseState.Draft ? (
              // key: layouts preserve client state across navigation — without
              // this, one phase's editor state could survive into another
              // phase's editor (2.4 review finding).
              <PhaseEditor
                key={phaseType}
                discoveryId={id}
                phaseType={phaseType}
                initialOutput={editorOutput}
              />
            ) : (
              <p className="text-body text-on-surface-variant">
                The {name} editor arrives in an upcoming story.
              </p>
            )}
          </PhaseCard>
        </>
      )}
    </AppShell>
  );
}
