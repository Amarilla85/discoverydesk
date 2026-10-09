import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DiscoveryStateBadge } from "@/components/discovery/discovery-state-badge";
import { PhaseOutputView } from "@/components/phase/phase-output-view";
import { isAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { PHASE_NAMES, PHASE_ORDER, buildStateMap } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/*
 * Testing-phase admin overview — the read-only detail half (Mar's decision,
 * 2026-10-08, see lib/admin.ts). Renders ONE Discovery's every phase and
 * output with the same renderer the review surface uses (PhaseOutputView) —
 * what the BA authored, nothing recomputed, nothing editable.
 *
 * Gate: same as the list — session email must match OWNER_EMAIL, non-owners
 * get notFound (NFR9: never a 403 that leaks existence).
 *
 * Deliberately NOT the workspace route: the query has no owner-or-collaborator
 * filter (this page's whole reason to exist), so it must never render a
 * mutation control — no actions, no forms, no polling (AD-3/AD-9). Guests'
 * work stays untouched; the existing actions/* checks are untouched.
 */
export default async function AdminDiscoveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect("/auth/signin");
  if (!isAdminEmail(session.user?.email)) notFound();

  const discovery = await prisma.discovery.findUnique({
    where: { id },
    select: {
      name: true,
      lifecycleState: true,
      createdAt: true,
      owner: { select: { name: true, email: true } },
      phases: { select: { phaseType: true, state: true, output: true } },
    },
  });
  if (!discovery) notFound();

  const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
  const states = buildStateMap(discovery.phases);

  // One read-only section per phase in PHASE_ORDER — the stepper's canonical
  // order, same rows the summary view's sign-off list uses. A phase whose row
  // is missing (never authored) still renders, with its defaults state.
  const phaseRows = PHASE_ORDER.map((phaseType) => ({
    phaseType,
    name: PHASE_NAMES[phaseType],
    state: states[phaseType],
    output: discovery.phases.find((p) => p.phaseType === phaseType)?.output,
  }));

  return (
    <AppShell>
      <section className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-display-sm text-on-surface [overflow-wrap:anywhere]">
              {discovery.name}
            </h1>
            <DiscoveryStateBadge state={discovery.lifecycleState} />
          </div>
          <p className="text-caption text-on-surface-variant">
            Read-only admin view · Owner:{" "}
            {discovery.owner.email ?? discovery.owner.name} · Created{" "}
            {dateFormat.format(discovery.createdAt)}
          </p>
        </header>

        <div className="flex flex-col gap-8">
          {phaseRows.map((phase) => (
            <div key={phase.phaseType} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-h2 text-on-surface">{phase.name}</h2>
                <span className="text-caption text-on-surface-variant">
                  {phase.state}
                </span>
              </div>
              <PhaseOutputView
                phaseType={phase.phaseType}
                output={phase.output ?? null}
              />
            </div>
          ))}
        </div>

        <Link
          href="/admin/discoveries"
          className="inline-block rounded-sm text-body-sm text-primary underline underline-offset-2"
        >
          Back to all discoveries
        </Link>
      </section>
    </AppShell>
  );
}
