import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { PhaseState, PhaseType } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth";
import { PHASE_NAMES, PHASE_ORDER, buildStateMap } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { normalizeVisionOutput } from "@/lib/schemas/vision";

/*
 * Story 3.3 (FR-16, revived 2026-10-06) — the Executive Summary view: a
 * read-only Server Component snapshot of the Phase 5 (Vision) problem
 * statement + product vision and the six phases' sign-off status (FR-16's
 * MINIMAL scope; the full version — pains, value-prop headline, business
 * case, comments count — stays post-MVP). A VIEW, not a seventh phase: no
 * PhaseType change, no migration, no state-machine changes, no actions, no
 * polling (AD-3). One server render per visit; fresh states appear on the
 * next navigation (AC 6).
 *
 * NFR9 access posture, copied from the workspace phase page: no session →
 * sign-in redirect; the owner-or-collaborator filter is the real access
 * check — a Discovery the user cannot see is indistinguishable from one
 * that does not exist (notFound, never a 403 that leaks existence).
 *
 * The AppShell call passes ONLY `discoveryName` — no discoveryId/canRename
 * pair, no markApproved, no invite, no summaryHref — so the top bar renders
 * the name as plain text with no discovery-scoped controls (minimal scope).
 */
export default async function SummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  const discovery = await prisma.discovery.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    },
    select: {
      name: true,
      // Every phase rides the query: Vision's output feeds the summary
      // sections, and every phase's state feeds the sign-off rows ("fine
      // at this scale", the phase page's precedent).
      phases: {
        select: {
          phaseType: true,
          state: true,
          output: true,
        },
      },
    },
  });
  if (!discovery) notFound();

  // Phase 5 output → the two FR-16 fields. normalizeVisionOutput absorbs a
  // never-authored phase (null) and legacy `{ notes }` shapes into defaults;
  // the schema has no trimming, so a whitespace-only field renders as empty
  // (the form's own behavior) → each missing field degrades to its
  // empty-state line (AC 3).
  const vision = normalizeVisionOutput(
    discovery.phases.find((p) => p.phaseType === PhaseType.Vision)?.output ??
      null,
  );
  const problemStatement = vision.problemStatement;
  const productVision = vision.productVision;

  // Sign-off rows: Approved or Pending, reflecting Phase.state exactly
  // (Draft/InReview → Pending) via the same helpers the phase page uses —
  // the state logic is never restated here.
  const states = buildStateMap(discovery.phases);
  const signoffRows = PHASE_ORDER.map((phaseType) => ({
    phaseType,
    name: PHASE_NAMES[phaseType],
    approved: states[phaseType] === PhaseState.Approved,
  }));

  return (
    <AppShell discoveryName={discovery.name}>
      <header className="flex flex-col gap-2">
        <h1 className="text-display-sm text-on-surface">Executive Summary</h1>
      </header>

      <div className="mt-8 flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          {/* The Section shape mirrors phase-output-view.tsx's label+body
              pattern (replicated locally — that component is phase-specific).
              Values render with the 3.2 overflow patch: textareas produce
              newlines (whitespace-pre-wrap) and long text wraps
              (break-words). */}
          <div>
            <p className="text-label text-on-surface">Problem statement</p>
            <div className="mt-1 text-body text-on-surface">
              {problemStatement.trim() === "" ? (
                <p className="text-body text-on-surface-variant">
                  No problem statement yet.
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words">
                  {problemStatement}
                </p>
              )}
            </div>
          </div>
          <div>
            <p className="text-label text-on-surface">Product vision</p>
            <div className="mt-1 text-body text-on-surface">
              {productVision.trim() === "" ? (
                <p className="text-body text-on-surface-variant">
                  No product vision yet.
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words">
                  {productVision}
                </p>
              )}
            </div>
          </div>
        </div>

        <div>
          <p className="text-label text-on-surface">Sign-off status</p>
          {/* One row per phase in PHASE_ORDER (AC 4). The chip text carries
              the state for screen readers (the check icon is decorative);
              text + icon — never color alone (the 2.13 baseline). Approved
              wears the PhaseStepper's completed-state token. */}
          <ul className="mt-3 flex flex-col gap-3">
            {signoffRows.map((row) => (
              <li
                key={row.phaseType}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-body text-on-surface">{row.name}</span>
                {row.approved ? (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-success px-2 py-0.5 text-caption text-success-foreground">
                    <Check className="size-3.5" aria-hidden="true" />
                    Approved
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-sm border border-outline-variant px-2 py-0.5 text-caption text-on-surface-variant">
                    Pending
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Phase 1 is the workspace's entry point (always exists, never
            locked — the stepper's first step). */}
        <Link
          href={`/discoveries/${id}/phases/1`}
          className="inline-block rounded-sm text-body-sm text-primary underline underline-offset-2"
        >
          Back to workspace
        </Link>
      </div>
    </AppShell>
  );
}
