"use server";

import { revalidatePath } from "next/cache";
import { LifecycleState, PhaseState } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { PHASE_ORDER } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { discoverySchema } from "@/lib/schemas/discovery";

// Story 1.4 — first Server Action (AD-10). Every export in a "use server"
// file must be an async function; shared types below are erased at compile.
//
// AD-12 / NFR8: the action returns a typed error envelope — never a thrown
// raw error to the client. Error codes are snake_case per the Consistency
// Conventions (auth_required, validation_error, server_error).
export type CreateDiscoveryState =
  | { ok: true; discovery: { id: string; name: string } }
  | { ok: false; error: { code: string; message: string; field?: string } };

// Story 2.12 (FR13) — the Discovery-approval envelope. Same shape as
// actions/phases.ts's PhaseActionState (one envelope shape per project; a
// per-file type, not a shared import, keeps "use server" exports async-only).
export type DiscoveryActionState =
  | { ok: true; discovery: { id: string; lifecycleState: LifecycleState } }
  | { ok: false; error: { code: string; message: string; field?: string } };

// FR1: create a Discovery (owner = session user, lifecycle Draft) with all 6
// phases initialized to Draft in one atomic write. Server Functions are
// reachable via direct POST — the session check here is the real guard, the
// page-level redirect is only the visible layer (Next.js data-security note).
export async function createDiscovery(
  _prevState: CreateDiscoveryState | null,
  formData: FormData,
): Promise<CreateDiscoveryState> {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = discoverySchema.safeParse(formData.get("name") ?? "");
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Name is required.",
        field: "name",
      },
    };
  }

  try {
    const discovery = await prisma.$transaction(async (tx) =>
      tx.discovery.create({
        data: {
          name: parsed.data,
          ownerId,
          // lifecycleState and phase state default to Draft at the schema
          // level (Story 1.1); output stays null until Epic 2 writes it.
          phases: {
            create: PHASE_ORDER.map((phaseType) => ({ phaseType })),
          },
        },
        select: { id: true, name: true },
      }),
    );

    // Refresh the server-rendered list so the new Discovery appears at the
    // top (orderBy updatedAt desc — @updatedAt bumps on create).
    revalidatePath("/");

    return { ok: true, discovery };
  } catch (error) {
    // Review finding (1.4): the envelope above is all the client may see —
    // the real cause goes to the server logs, or production failures are
    // undiagnosable.
    console.error("createDiscovery failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}

/*
 * Story 2.12 (FR13) — "Mark Approved": the Discovery lifecycle flips to
 * Approved with the final approval record (approver = the clicker via
 * approvedById/approvedAt — NOT derivable from Signoff rows; see the schema
 * comment). The gate is re-verified server-side against PHASE states: the
 * button's readiness is client-provided and untrusted. Equivalence note: the
 * epics' gate is sign-off-based ("all 6 phases have ≥1 Stakeholder sign-off"),
 * but as implemented only a Stakeholder can approve a phase
 * (approvePhase is Stakeholder-only since 2.11), so every phase Approved ⟺
 * every phase has a Stakeholder approve sign-off — keep ONE gate
 * (isDiscoveryApprovalReady on states), never count Signoff rows here.
 *
 * Permission: any collaborator (owner or either role — the access filter IS
 * the membership check). The button has rendered for all collaborators since
 * 2.11 and EXPERIENCE.md Flow 1 has the BA clicking it; the Stakeholder-only
 * control lives at phase sign-off, which all six phases already passed.
 * Flagged to the product owner (story Open Question 1).
 *
 * Concurrency (2.11 review-fix pattern): the lifecycle precondition rides in
 * the WHERE of a conditional updateMany, so two simultaneous "Mark Approved"
 * clicks race on the row lock and the loser matches 0 rows instead of
 * double-writing the record.
 */
const approveDiscoverySchema = z.object({
  discoveryId: z.string().min(1),
});

export async function approveDiscovery(
  _prevState: DiscoveryActionState | null,
  formData: FormData,
): Promise<DiscoveryActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = approveDiscoverySchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid approval.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Access check (owner or collaborator) before anything else touches data.
      const discovery = await tx.discovery.findFirst({
        where: {
          id: parsed.data.discoveryId,
          OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
        },
        select: {
          id: true,
          phases: { select: { phaseType: true, state: true } },
        },
      });
      if (!discovery) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Discovery not found." },
        };
      }

      // Server-side gate re-verification (see the block comment above).
      const allApproved = PHASE_ORDER.every(
        (phaseType) =>
          discovery.phases.find((p) => p.phaseType === phaseType)?.state ===
          PhaseState.Approved,
      );
      if (!allApproved) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "Not all phases are approved yet.",
          },
        };
      }

      // Conditional write: only a non-Approved discovery can flip (a second
      // concurrent click loses the race here, matching 0 rows).
      const updated = await tx.discovery.updateMany({
        where: {
          id: discovery.id,
          lifecycleState: { not: LifecycleState.Approved },
        },
        data: {
          lifecycleState: LifecycleState.Approved,
          approvedById: userId,
          approvedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This Discovery is already approved.",
          },
        };
      }
      return {
        ok: true as const,
        discovery: {
          id: discovery.id,
          lifecycleState: LifecycleState.Approved,
        },
      };
    });

    if (!result.ok) return result;

    // Refresh the workspace (top bar button, phase cards, list badge — the
    // list's badge reads lifecycleState, so "/" is revalidated too).
    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    revalidatePath("/");

    return result;
  } catch (error) {
    console.error("approveDiscovery failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
