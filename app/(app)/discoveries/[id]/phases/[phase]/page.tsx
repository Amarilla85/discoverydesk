import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  LifecycleState,
  PhaseState,
  PhaseType,
  SignoffType,
} from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import {
  PhaseStepper,
  type StepperPhase,
} from "@/components/phase/phase-stepper";
import { PhaseCard } from "@/components/phase/phase-card";
import { PhaseEditor } from "@/components/phase/phase-editor";
import { PhaseOutputView } from "@/components/phase/phase-output-view";
import { ReopenPhase } from "@/components/phase/reopen-phase";
import { RevisionRecord } from "@/components/phase/revision-record";
import { SignoffControls } from "@/components/phase/signoff-controls";
import { SignoffRecord } from "@/components/phase/signoff-record";
import { SubmitForReview } from "@/components/phase/submit-for-review";
import { auth } from "@/lib/auth";
import {
  PHASE_DESCRIPTIONS,
  PHASE_NAMES,
  PHASE_ORDER,
  buildStateMap,
  computePhaseLocks,
  defaultPhaseNumber,
  isDiscoveryApprovalReady,
  phaseFromParam,
  phaseNumber,
} from "@/lib/constants";
import { resolveCollaboratorRole, type MemberRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  BUSINESS_CASE_DEFAULTS,
  normalizeBusinessCaseOutput,
} from "@/lib/schemas/business-case";
import {
  BUSINESS_MODEL_DEFAULTS,
  normalizeBusinessModelOutput,
} from "@/lib/schemas/business-model";
import {
  PAIN_GAIN_DEFAULTS,
  normalizePainGainOutput,
} from "@/lib/schemas/pain-gain";
import {
  PERSONA_DEFAULTS,
  normalizePersonaOutput,
} from "@/lib/schemas/persona";
import {
  VALUE_PROP_DEFAULTS,
  isEmptyValueProp,
  normalizeValuePropOutput,
  seedValuePropFromPrior,
} from "@/lib/schemas/value-prop";
import {
  VISION_DEFAULTS,
  normalizeVisionOutput,
  selectTopPainSuggestions,
} from "@/lib/schemas/vision";

// Story 2.11 (DESIGN.md: the Submit for Review button is "only visible when
// phase has data"): every normalizeXxxOutput spreads its X_DEFAULTS first, so
// key order is canonical and a stringify compare is a reliable empty check —
// the same trick the read-only view and the forms' dedupe use. This reads the
// PERSISTED output (not the 2.7 seed): an unedited seeded phase is not yet
// authored content, so it does not unlock submission.
function phaseHasData(phaseType: PhaseType, raw: unknown): boolean {
  switch (phaseType) {
    case PhaseType.Persona:
      return (
        JSON.stringify(normalizePersonaOutput(raw)) !==
        JSON.stringify(PERSONA_DEFAULTS)
      );
    case PhaseType.PainGain:
      return (
        JSON.stringify(normalizePainGainOutput(raw)) !==
        JSON.stringify(PAIN_GAIN_DEFAULTS)
      );
    case PhaseType.ValueProp:
      return (
        JSON.stringify(normalizeValuePropOutput(raw)) !==
        JSON.stringify(VALUE_PROP_DEFAULTS)
      );
    case PhaseType.BusinessModel:
      return (
        JSON.stringify(normalizeBusinessModelOutput(raw)) !==
        JSON.stringify(BUSINESS_MODEL_DEFAULTS)
      );
    case PhaseType.Vision:
      return (
        JSON.stringify(normalizeVisionOutput(raw)) !==
        JSON.stringify(VISION_DEFAULTS)
      );
    case PhaseType.BusinessCase:
      return (
        JSON.stringify(normalizeBusinessCaseOutput(raw)) !==
        JSON.stringify(BUSINESS_CASE_DEFAULTS)
      );
  }
}

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
      // Story 2.11: ownerId + Collaborator rows resolve the viewer's role
      // (lib/permissions.ts is the single rule); the viewed phase's sign-off
      // records surface in the phase view. Pulling every phase's sign-offs
      // is fine at this scale.
      ownerId: true,
      // Story 2.12 (FR13): the lifecycle drives the approved-lock UX, the
      // Reopen Phase control, and the top bar button's hidden state.
      lifecycleState: true,
      collaborators: { select: { userId: true, role: true } },
      // Story 2.3: the viewed phase's output seeds the auto-saving editor;
      // other phases only need type + state for the stepper/gate.
      phases: {
        select: {
          phaseType: true,
          state: true,
          output: true,
          signoffs: {
            orderBy: { timestamp: "desc" },
            select: {
              id: true,
              userId: true,
              type: true,
              comment: true,
              timestamp: true,
              user: { select: { name: true, email: true } },
            },
          },
          // Story 2.12 (AC 6): the phase's reopen history — only the viewed
          // phase's revisions are needed (latest first, query-ordered).
          // previousOutput stays server-side; the record needs who + when.
          revisions: {
            orderBy: { reopenedAt: "desc" },
            select: {
              id: true,
              reopenedAt: true,
              reopenedBy: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!discovery) notFound();

  const states = buildStateMap(discovery.phases);
  const locks = computePhaseLocks(states);
  const number = phaseNumber(phaseType);
  const name = PHASE_NAMES[phaseType];
  // Story 2.11: role-aware branches (FR-3/FR-5). Server-resolved —
  // components only receive the outcome.
  // Story 2.12: ownership is the Reopen Phase grant (ACs 4/7) — checked
  // directly, NOT via the role helper (a BA Collaborator is not the Owner).
  const isOwner = discovery.ownerId === userId;
  const viewerRole: MemberRole = resolveCollaboratorRole({
    isOwner,
    collaboratorRole:
      discovery.collaborators.find((c) => c.userId === userId)?.role ?? null,
  });
  // Story 2.12 (FR13): the Discovery-level lifecycle — drives the top bar
  // button's hidden state, the approved-lock notice, and the reopen control.
  const discoveryApproved =
    discovery.lifecycleState === LifecycleState.Approved;
  // Toast attribution name for the sign-off confirmations (name ?? email,
  // the 2.4 convention — the actor IS the current user).
  const viewerName = session?.user?.name ?? session?.user?.email ?? "Unknown";
  // Latest sign-off records for the viewed phase (query orders desc).
  const currentPhaseRow = discovery.phases.find(
    (p) => p.phaseType === phaseType,
  );
  const latestApprove =
    currentPhaseRow?.signoffs.find((s) => s.type === SignoffType.approve) ??
    null;
  const latestChanges =
    currentPhaseRow?.signoffs.find((s) => s.type === SignoffType.requestChanges) ??
    null;
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
  // Story 2.9 (FR-11 / UX-DR19): the Vision form's top-3 pain-point chips.
  // Composed server-side from Phase 2's already-fetched output and passed as
  // a PROP — ephemeral suggestions, deliberately NOT merged into
  // editorOutput: chips are UI prompts, never persisted into Phase.output
  // (2.7's seed trick would write them there via auto-save).
  let suggestedPains: string[] = [];
  if (phaseType === PhaseType.Vision) {
    const painGainOutput =
      discovery.phases.find((p) => p.phaseType === PhaseType.PainGain)
        ?.output ?? null;
    suggestedPains = selectTopPainSuggestions(painGainOutput);
  }
  const availableNumber = defaultPhaseNumber(states);
  const availableType = PHASE_ORDER[availableNumber - 1];
  // The blocking phase for a locked phase N is its predecessor (N-1); phase 1
  // is never locked, so the -2 index is always valid here.
  const predecessorName = PHASE_NAMES[PHASE_ORDER[number - 2]];
  // Story 2.11 (FR-13, partial) + 2.12 (live): the top bar's "Mark Approved"
  // unlocks when every phase is Approved; the click runs approveDiscovery
  // (components/layout/mark-approved-button.tsx) and the button hides on an
  // approved discovery. Gate equivalence: only a Stakeholder can approve a
  // phase, so "every phase Approved" ⟺ "every phase has a Stakeholder
  // sign-off" (the epics' sign-off wording) — one gate, never Signoff counts.
  const markApprovedReady = isDiscoveryApprovalReady(states);
  // Story 2.11: the sign-off affordances (FR-5). Submit for Review is the
  // BA's, and only on a Draft phase with persisted data; the sign-off buttons
  // are the Stakeholder's, and only on an In Review phase.
  const isDraft = states[phaseType] === PhaseState.Draft;
  const isInReview = states[phaseType] === PhaseState.InReview;
  // Read-only polling host (the 2.4 hand-off): the editor owns the Draft+BA
  // view; every other LIVE view (Draft Stakeholder, In Review — any role)
  // polls here. Approved polls nothing (terminal in this story).
  const signoffPoll =
    isInReview || (isDraft && viewerRole === "Stakeholder");

  const stepperPhases: StepperPhase[] = PHASE_ORDER.map((phaseType) => ({
    phaseType,
    state: states[phaseType],
    locked: locks[phaseType],
  }));

  return (
    <AppShell
      discoveryName={discovery.name}
      markApproved={{
        discoveryId: id,
        ready: markApprovedReady,
        approved: discoveryApproved,
      }}
    >
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
              put the auto-saving editor inside it for Draft phases (FR6,
              NFR2); Story 2.10 completed the per-phase forms. Story 2.11
              completes the card's lifecycle: role-aware branches per the
              EXPERIENCE.md phase state machine — Draft+BA edits, everything
              else renders the read-only output view (In Review is not
              editable; a Stakeholder never edits, FR-3), with the sign-off
              record (Approved) or change request (Draft) surfaced alongside.
              Story 2.12 closes it: an Approved Discovery locks the card
              (read-only notice for the BA), the Owner gets the Reopen Phase
              control, and reopen history renders below the sign-off record.

              SLOT LAYOUT IS LOAD-BEARING: the fixed children below are fixed
              positions (null-preserving ternaries), so SubmitForReview,
              SignoffControls, and ReopenPhase keep their component identity
              across state flips — their action toasts must survive the
              same-flight RSC refresh that follows every submit/sign-off/
              reopen (see the components' mount contracts). Content slot
              changes type by design (editor ⇄ output view). */}
          <PhaseCard state={states[phaseType]} locked={false} active className="mt-8">
            {/* AC 5: the latest change request, surfaced on Draft phases above
                the content — the returning BA (or a Stakeholder) sees WHY the
                phase came back first. Full comment threads are Story 3.2. */}
            {isDraft && latestChanges ? (
              <div className="mb-6">
                <SignoffRecord
                  mode="changesRequested"
                  name={
                    latestChanges.user?.name ??
                    latestChanges.user?.email ??
                    "Unknown"
                  }
                  role={null}
                  timestamp={latestChanges.timestamp}
                  comment={latestChanges.comment}
                />
              </div>
            ) : null}
            {isDraft && viewerRole === "BA" ? (
              // key: layouts preserve client state across navigation — without
              // this, one phase's editor state could survive into another
              // phase's editor (2.4 review finding).
              <PhaseEditor
                key={phaseType}
                discoveryId={id}
                phaseType={phaseType}
                initialOutput={editorOutput}
                suggestedPains={suggestedPains}
              />
            ) : (
              // In Review / Approved (any role) and Draft+Stakeholder: the
              // read-only output view — a reviewer must see what they review.
              <PhaseOutputView phaseType={phaseType} output={currentOutput} />
            )}
            {/* AC 3: the approve record below the read-only output on
                Approved phases (approver name, role, timestamp). */}
            {states[phaseType] === PhaseState.Approved && latestApprove ? (
              <div className="mt-6">
                <SignoffRecord
                  mode="approved"
                  name={
                    latestApprove.user?.name ??
                    latestApprove.user?.email ??
                    "Unknown"
                  }
                  role={
                    discovery.collaborators.find(
                      (c) => c.userId === latestApprove.userId,
                    )?.role ?? null
                  }
                  timestamp={latestApprove.timestamp}
                />
              </div>
            ) : null}
            {/* AC 6: the phase's reopen history below the sign-off record —
                on a reopened (Draft) phase the approved record is gone (its
                sign-offs were discarded) and the revision entries stand
                alone in that position. Visible to ALL collaborators;
                latest reopen first. */}
            {currentPhaseRow?.revisions.map((revision) => (
              <div key={revision.id} className="mt-6">
                <RevisionRecord
                  name={
                    revision.reopenedBy?.name ??
                    revision.reopenedBy?.email ??
                    "Unknown"
                  }
                  timestamp={revision.reopenedAt}
                />
              </div>
            ))}
            {/* AC 3 (visible layer): on an Approved discovery the BA sees
                WHY the card is read-only (the enforcement layer is the
                discovery_approved guard in updatePhase; Stakeholders never
                had edit controls — AC 7). */}
            {discoveryApproved && viewerRole === "BA" ? (
              <p className="mt-6 text-body-sm text-on-surface-variant">
                This Discovery is approved. To make changes, a phase must be
                reopened, which creates a new revision.
              </p>
            ) : null}
            <SubmitForReview
              discoveryId={id}
              phaseType={phaseType}
              visible={
                isDraft && viewerRole === "BA" && phaseHasData(phaseType, currentOutput)
              }
            />
            <SignoffControls
              discoveryId={id}
              phaseType={phaseType}
              visible={isInReview && viewerRole === "Stakeholder"}
              poll={signoffPoll}
              approvedByName={
                isInReview && latestApprove
                  ? (latestApprove.user?.name ??
                    latestApprove.user?.email ??
                    "Unknown")
                  : null
              }
              viewerName={viewerName}
            />
            {/* ACs 4/7: Owner-only on an Approved discovery — the page owns
                both conditions; the component is a stable slot so its
                success toast survives the Approved → Draft branch flip. */}
            <ReopenPhase
              discoveryId={id}
              phaseType={phaseType}
              visible={isOwner && discoveryApproved}
            />
          </PhaseCard>
        </>
      )}
    </AppShell>
  );
}
