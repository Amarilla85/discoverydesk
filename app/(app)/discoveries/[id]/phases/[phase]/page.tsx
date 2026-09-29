import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  PhaseStepper,
  type StepperPhase,
} from "@/components/phase/phase-stepper";
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
      phases: { select: { phaseType: true, state: true } },
    },
  });
  if (!discovery) notFound();

  const states = buildStateMap(discovery.phases);
  const locks = computePhaseLocks(states);
  const number = phaseNumber(phaseType);
  const name = PHASE_NAMES[phaseType];
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
        // locked-phase microcopy, UX-DR25).
        <div className="rounded-lg border border-outline-variant bg-surface p-6">
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
        </div>
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
          {/* Story 2.1 ships the navigation and the gate, not the editors —
              the phase forms arrive in Stories 2.5–2.10, the Phase Card in
              2.2. This card is the slot they replace. */}
          <div className="mt-8 rounded-lg border border-outline-variant bg-surface p-6">
            <p className="text-body text-on-surface-variant">
              The {name} editor arrives in an upcoming story.
            </p>
          </div>
        </>
      )}
    </AppShell>
  );
}
