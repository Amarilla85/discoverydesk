"use server";

import { revalidatePath } from "next/cache";
import {
  LifecycleState,
  PhaseState,
  PhaseType,
  Prisma,
  SignoffType,
} from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  buildStateMap,
  computePhaseLocks,
  type PhaseStatesByType,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { resolveCollaboratorRole, type MemberRole } from "@/lib/permissions";
import { painGainSchema } from "@/lib/schemas/pain-gain";
import { personaSchema } from "@/lib/schemas/persona";
import { valuePropSchema } from "@/lib/schemas/value-prop";
import { businessModelSchema } from "@/lib/schemas/business-model";
import { visionSchema } from "@/lib/schemas/vision";
import { businessCaseSchema } from "@/lib/schemas/business-case";

// Story 2.1 — the phase-update Server Action (AD-10). Conventions mirror
// actions/discoveries.ts (AD-12 typed envelope, snake_case codes, never a raw
// throw to the client, server-side console.error for diagnosis).
//
// ARCH-8 write-path gate: before any write, the AD-6 rule is enforced here —
// a phase whose predecessor is not Approved cannot be updated, and the action
// returns exactly `{ code: "phase_gate_blocked", message: "Complete the
// previous phase first." }` (AC 8). The gate check uses computePhaseLocks
// from lib/constants.ts — the same helper the workspace page uses on the read
// path (ARCH-9), so the rule exists once.
//
// Server Functions are reachable via direct POST — the session check here is
// the real guard, the page-level redirect is only the visible layer.
export type PhaseActionState =
  | { ok: true; phase: { id: string; phaseType: PhaseType } }
  | { ok: false; error: { code: string; message: string; field?: string } };

// Input validation (AD-11): phase output JSON is free-form until each phase's
// Zod schema lands with its editor (Stories 2.5–2.10) — this action validates
// the envelope, not the output shape. The output is optional for now; the
// auto-save integration (Story 2.3) always sends it.
//
// Story 2.5 (AD-11/ARCH-10 write path): phases with a landed schema validate
// their output server-side against the SAME schema the form uses — schema
// change is the only way to change form shape. Complete as of Story 2.10:
// all six phase schemas are registered (Stories 2.5–2.10).
// validation_error is terminal in the auto-save retry ladder;
// form-driven saves stay schema-valid by construction, so this fires only
// for tampered/direct POSTs — that backstop is its purpose.
const PHASE_OUTPUT_SCHEMAS: Partial<Record<PhaseType, z.ZodTypeAny>> = {
  [PhaseType.Persona]: personaSchema,
  [PhaseType.PainGain]: painGainSchema,
  [PhaseType.ValueProp]: valuePropSchema,
  [PhaseType.BusinessModel]: businessModelSchema,
  [PhaseType.Vision]: visionSchema,
  [PhaseType.BusinessCase]: businessCaseSchema,
};

const updatePhaseSchema = z.object({
  discoveryId: z.string().min(1),
  phaseType: z.nativeEnum(PhaseType),
  output: z.string().optional(),
});

/*
 * Story 2.11 — role resolution + phase context for the review actions. One
 * load answers access (owner-or-collaborator, the real check), role (via
 * resolveCollaboratorRole — the single rule lives in lib/permissions.ts),
 * and the current state map for the ARCH-8 gate. The role rule itself is
 * never restated here.
 *
 * Not exported: a "use server" module may only export async functions.
 */
type ReviewContext =
  | {
      ok: true;
      discoveryId: string;
      role: MemberRole;
      states: PhaseStatesByType;
      state: PhaseState;
    }
  | { ok: false; error: { code: string; message: string } };

async function loadReviewContext(
  tx: Prisma.TransactionClient,
  discoveryId: string,
  userId: string,
  phaseType: PhaseType,
): Promise<ReviewContext> {
  const discovery = await tx.discovery.findFirst({
    where: {
      id: discoveryId,
      OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
    },
    select: {
      id: true,
      ownerId: true,
      collaborators: { select: { userId: true, role: true } },
      phases: { select: { phaseType: true, state: true } },
    },
  });
  if (!discovery) {
    return {
      ok: false,
      error: { code: "not_found", message: "Discovery not found." },
    };
  }
  const role = resolveCollaboratorRole({
    isOwner: discovery.ownerId === userId,
    collaboratorRole:
      discovery.collaborators.find((c) => c.userId === userId)?.role ?? null,
  });
  return {
    ok: true,
    discoveryId: discovery.id,
    role,
    states: buildStateMap(discovery.phases),
    state:
      discovery.phases.find((p) => p.phaseType === phaseType)?.state ??
      PhaseState.Draft,
  };
}

export async function updatePhase(
  _prevState: PhaseActionState | null,
  formData: FormData,
): Promise<PhaseActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = updatePhaseSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    phaseType: formData.get("phaseType") ?? "",
    output: formData.get("output") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid phase update.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  // AD-7: phase output is stored as JSON. Reject unparseable payloads with a
  // typed error rather than letting Prisma's Json cast throw a server_error.
  let output: Prisma.InputJsonValue | undefined;
  if (parsed.data.output !== undefined) {
    try {
      output = JSON.parse(parsed.data.output) as Prisma.InputJsonValue;
    } catch {
      return {
        ok: false,
        error: {
          code: "validation_error",
          message: "Phase output must be valid JSON.",
          field: "output",
        },
      };
    }

    // Story 2.5: per-phase schema validation (AD-11/ARCH-10 write path).
    const outputSchema = PHASE_OUTPUT_SCHEMAS[parsed.data.phaseType];
    if (outputSchema) {
      const outputCheck = outputSchema.safeParse(output);
      if (!outputCheck.success) {
        return {
          ok: false,
          error: {
            code: "validation_error",
            // Interpolate the phase type: this backstop is shared by the
            // schemas landing in Stories 2.6–2.10.
            message: `Invalid ${parsed.data.phaseType} output.`,
            field: outputCheck.error.errors[0]?.path.join(".") || "output",
          },
        };
      }
    }
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
          ownerId: true,
          lifecycleState: true,
          collaborators: { select: { userId: true, role: true } },
          phases: { select: { phaseType: true, state: true } },
        },
      });
      if (!discovery) {
        return {
          ok: false as const,
          error: {
            code: "not_found",
            message: "Discovery not found.",
          },
        };
      }

      // Story 2.12 (AC 3, FR13): an Approved Discovery is locked against
      // editing — the visible layer is the page's lock notice (the editor
      // never renders on an approved discovery), this is the enforcement for
      // stale clients / direct POSTs. New envelope code: discovery_approved.
      if (discovery.lifecycleState === LifecycleState.Approved) {
        return {
          ok: false as const,
          error: {
            code: "discovery_approved",
            message:
              "This Discovery is approved. To make changes, a phase must be reopened, which creates a new revision.",
          },
        };
      }

      // Story 2.11 (FR-3): Stakeholders cannot edit phase content — the page
      // renders them no editor, but a direct POST lands here, so this is the
      // enforcement. Recorded as not_permitted (new in 2.11); the auto-save
      // retry ladder treats unknown codes as terminal, which is correct (a
      // Stakeholder's client should never be saving).
      const role = resolveCollaboratorRole({
        isOwner: discovery.ownerId === userId,
        collaboratorRole:
          discovery.collaborators.find((c) => c.userId === userId)?.role ??
          null,
      });
      if (role !== "BA") {
        return {
          ok: false as const,
          error: {
            code: "not_permitted",
            message: "You do not have permission to edit this phase.",
          },
        };
      }

      // ARCH-8 phase gate — final-shape error envelope (AC 8).
      const locks = computePhaseLocks(buildStateMap(discovery.phases));
      if (locks[parsed.data.phaseType]) {
        return {
          ok: false as const,
          error: {
            code: "phase_gate_blocked",
            message: "Complete the previous phase first.",
          },
        };
      }

      // A missing `output` is a gate-probe with nothing to persist: after the
      // gate passes, report success without writing. Story 2.3's auto-save
      // always sends output, making this a no-op it never hits.
      if (output === undefined) {
        const phase = await tx.phase.findUniqueOrThrow({
          where: {
            discoveryId_phaseType: {
              discoveryId: discovery.id,
              phaseType: parsed.data.phaseType,
            },
          },
          select: { id: true, phaseType: true },
        });
        return { ok: true as const, phase };
      }

      const phase = await tx.phase.update({
        where: {
          discoveryId_phaseType: {
            discoveryId: discovery.id,
            phaseType: parsed.data.phaseType,
          },
        },
        // Story 2.4: the output-write records its writer — the attribution
        // source for the "Updated by {name}." polling toast (UX-DR27). The
        // gate-probe path above intentionally stays writer-less.
        data: { output, updatedById: userId },
        select: { id: true, phaseType: true },
      });
      return { ok: true as const, phase };
    });

    if (!result.ok) return result;

    // Refresh the workspace (stepper states, phase content). The list's
    // updatedAt ordering benefits too, but "/" isn't revalidated here —
    // no list-affecting mutation happened (Story 1.4 precedent).
    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);

    return result;
  } catch (error) {
    // The envelope is all the client may see — the real cause goes to the
    // server logs, or production failures are undiagnosable (1.4 review).
    console.error("updatePhase failed:", error);
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
 * Story 2.11 — the review loop (FR-5). Three actions, all with the same
 * posture as updatePhase: AD-12 typed envelope, snake_case codes, access +
 * role + gate enforced inside one transaction, revalidatePath on success,
 * console.error + server_error catch-all. New envelope codes: not_permitted
 * (role mismatch — enforcement for FR-3/FR-5), invalid_state (the transition
 * precondition — the backstop for double-submits from two tabs; the RSC
 * refresh normally removes the affordance before this can fire).
 *
 * Story 2.12 adds discovery_approved (updatePhase's lock guard — an Approved
 * Discovery's phases cannot be edited until the Owner reopens one, FR13).
 *
 * Sign-off records (AC 3/5): the Signoff row (Story 1.1's model, no
 * migration) stores identity + type + comment; the phase view derives name
 * and role from it at render time (components/phase/signoff-record.tsx).
 * Phase.updatedById is set on every transition so other viewers' polling
 * attributes "Updated by {name}." to the actor (Story 2.4 convention).
 */

const reviewActionSchema = z.object({
  discoveryId: z.string().min(1),
  phaseType: z.nativeEnum(PhaseType),
});

// AC 1: BA submits a Draft phase for review → InReview. No notification is
// sent (FR-5, Decision 2026-09-11) — collaborators see the flip via the
// 10-second polling cycle. BA-only: a Stakeholder "cannot advance phases"
// (FR-3). Defense in depth: a locked phase cannot be submitted either.
export async function submitPhaseForReview(
  _prevState: PhaseActionState | null,
  formData: FormData,
): Promise<PhaseActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = reviewActionSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    phaseType: formData.get("phaseType") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid phase submission.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const context = await loadReviewContext(
        tx,
        parsed.data.discoveryId,
        userId,
        parsed.data.phaseType,
      );
      if (!context.ok) return context;

      if (context.role !== "BA") {
        return {
          ok: false as const,
          error: {
            code: "not_permitted",
            message: "Only the BA can submit phases for review.",
          },
        };
      }
      // ARCH-8: the write-path gate — a locked phase cannot be submitted.
      if (computePhaseLocks(context.states)[parsed.data.phaseType]) {
        return {
          ok: false as const,
          error: {
            code: "phase_gate_blocked",
            message: "Complete the previous phase first.",
          },
        };
      }
      if (context.state !== PhaseState.Draft) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not open for submission.",
          },
        };
      }

      const phase = await tx.phase.update({
        where: {
          discoveryId_phaseType: {
            discoveryId: context.discoveryId,
            phaseType: parsed.data.phaseType,
          },
        },
        data: { state: PhaseState.InReview, updatedById: userId },
        select: { id: true, phaseType: true },
      });
      return { ok: true as const, phase };
    });

    if (!result.ok) return result;

    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    return result;
  } catch (error) {
    console.error("submitPhaseForReview failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}

// AC 3: a Stakeholder approves an InReview phase → Approved, with the
// sign-off record (type approve) created in the SAME transaction — a torn
// write would desync the gate, which reads Phase.state. Stakeholder-only
// (FR-5): a BA approving their own work would defeat the review gate.
export async function approvePhase(
  _prevState: PhaseActionState | null,
  formData: FormData,
): Promise<PhaseActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = reviewActionSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    phaseType: formData.get("phaseType") ?? "",
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
      const context = await loadReviewContext(
        tx,
        parsed.data.discoveryId,
        userId,
        parsed.data.phaseType,
      );
      if (!context.ok) return context;

      if (context.role !== "Stakeholder") {
        return {
          ok: false as const,
          error: {
            code: "not_permitted",
            message: "Only stakeholders can approve phases.",
          },
        };
      }
      if (context.state !== PhaseState.InReview) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not open for review.",
          },
        };
      }

      // Conditional write (2.11 review finding): the state precondition rides
      // in the WHERE, so two concurrent approvals race on the row lock — the
      // loser's updateMany matches 0 rows (the winner already left InReview)
      // instead of passing a second Approved→Approved check and inserting a
      // duplicate Signoff row.
      const updated = await tx.phase.updateMany({
        where: {
          discoveryId: context.discoveryId,
          phaseType: parsed.data.phaseType,
          state: PhaseState.InReview,
        },
        data: { state: PhaseState.Approved, updatedById: userId },
      });
      if (updated.count === 0) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not open for review.",
          },
        };
      }
      const phase = await tx.phase.findUnique({
        where: {
          discoveryId_phaseType: {
            discoveryId: context.discoveryId,
            phaseType: parsed.data.phaseType,
          },
        },
        select: { id: true, phaseType: true },
      });
      if (phase === null) {
        // Unreachable after a successful conditional update inside this tx.
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not open for review.",
          },
        };
      }
      // Same transaction: the sign-off record IS the approval evidence
      // (approver name/role derive from it at render time).
      await tx.signoff.create({
        data: {
          phaseId: phase.id,
          userId,
          type: SignoffType.approve,
        },
      });
      return { ok: true as const, phase };
    });

    if (!result.ok) return result;

    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    return result;
  } catch (error) {
    console.error("approvePhase failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}

// AC 4/5: a Stakeholder requests changes on an InReview phase → Draft, with
// the required comment stored on the Signoff record and surfaced in the
// phase view. The Draft flip automatically re-locks the NEXT phase via the
// existing gate helpers — no extra code.
export async function requestChanges(
  _prevState: PhaseActionState | null,
  formData: FormData,
): Promise<PhaseActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const requestChangesSchema = reviewActionSchema.extend({
    comment: z.string(),
  });
  const parsed = requestChangesSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    phaseType: formData.get("phaseType") ?? "",
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid change request.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }
  // AC 4: the comment is required. Trim first — whitespace-only is empty.
  const comment = parsed.data.comment.trim();
  if (comment === "") {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Comment is required.",
        field: "comment",
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const context = await loadReviewContext(
        tx,
        parsed.data.discoveryId,
        userId,
        parsed.data.phaseType,
      );
      if (!context.ok) return context;

      if (context.role !== "Stakeholder") {
        return {
          ok: false as const,
          error: {
            code: "not_permitted",
            message: "Only stakeholders can request changes.",
          },
        };
      }
      if (context.state !== PhaseState.InReview) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not open for review.",
          },
        };
      }

      // Conditional write (2.11 review finding): same guard as approvePhase —
      // the InReview precondition in the WHERE makes a concurrent double
      // requestChanges a 0-row no-op instead of a second Draft pass with a
      // duplicate Signoff row.
      const updated = await tx.phase.updateMany({
        where: {
          discoveryId: context.discoveryId,
          phaseType: parsed.data.phaseType,
          state: PhaseState.InReview,
        },
        data: { state: PhaseState.Draft, updatedById: userId },
      });
      if (updated.count === 0) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not open for review.",
          },
        };
      }
      const phase = await tx.phase.findUnique({
        where: {
          discoveryId_phaseType: {
            discoveryId: context.discoveryId,
            phaseType: parsed.data.phaseType,
          },
        },
        select: { id: true, phaseType: true },
      });
      if (phase === null) {
        // Unreachable after a successful conditional update inside this tx.
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not open for review.",
          },
        };
      }
      // Same transaction: state flip + record are atomic (AC 5).
      await tx.signoff.create({
        data: {
          phaseId: phase.id,
          userId,
          type: SignoffType.requestChanges,
          comment,
        },
      });
      return { ok: true as const, phase };
    });

    if (!result.ok) return result;

    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    return result;
  } catch (error) {
    console.error("requestChanges failed:", error);
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
 * Story 2.12 (ACs 4/5, FR13) — the Owner reopens a phase on an APPROVED
 * Discovery. One transaction creates the Revision row (the previous output
 * JSON is preserved), discards that phase's sign-offs ("existing sign-offs on
 * this phase are discarded" — requestChanges rows go too: the fresh Draft
 * phase has no stale change request), flips the phase to Draft, and returns
 * the DISCOVERY lifecycle to Draft. Other phases' sign-offs are untouched.
 *
 * Ownership is the Owner check (discovery.ownerId === userId), NOT the BA
 * role — a BA Collaborator has full edit rights but is not the Owner
 * (AC 4/7). Reopen is scoped to Approved discoveries: a phase Approved while
 * the discovery is still Draft (normal mid-flow) has nothing to reopen into.
 *
 * The phase precondition rides in the WHERE (2.11 review-fix pattern), so a
 * concurrent double-reopen matches 0 rows instead of double-writing.
 * updatedById is set so other viewers' polling attributes the flip.
 */
export async function reopenPhase(
  _prevState: PhaseActionState | null,
  formData: FormData,
): Promise<PhaseActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = reviewActionSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    phaseType: formData.get("phaseType") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid reopen request.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Access + state load (owner-or-collaborator filter, the real check).
      const discovery = await tx.discovery.findFirst({
        where: {
          id: parsed.data.discoveryId,
          OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
        },
        select: {
          id: true,
          ownerId: true,
          lifecycleState: true,
          phases: {
            where: { phaseType: parsed.data.phaseType },
            select: { id: true, state: true, output: true },
          },
        },
      });
      if (!discovery) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Discovery not found." },
        };
      }

      // AC 4/7: ONLY the Discovery Owner may reopen — a BA Collaborator's
      // role-based edit grant does not extend here.
      if (discovery.ownerId !== userId) {
        return {
          ok: false as const,
          error: {
            code: "not_permitted",
            message: "Only the Discovery Owner can reopen phases.",
          },
        };
      }
      // Reopen is scoped to Approved discoveries (the UI never renders the
      // control otherwise; this is the direct-POST backstop).
      if (discovery.lifecycleState !== LifecycleState.Approved) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This Discovery is not approved.",
          },
        };
      }
      const phase = discovery.phases[0];
      if (!phase) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Phase not found." },
        };
      }

      // Conditional write: the Approved precondition in the WHERE — a phase
      // not currently Approved (concurrent reopen, stale tab) matches 0 rows.
      const updated = await tx.phase.updateMany({
        where: {
          discoveryId: discovery.id,
          phaseType: parsed.data.phaseType,
          state: PhaseState.Approved,
        },
        data: { state: PhaseState.Draft, updatedById: userId },
      });
      if (updated.count === 0) {
        return {
          ok: false as const,
          error: {
            code: "invalid_state",
            message: "This phase is not approved.",
          },
        };
      }

      // AC 5, same transaction: the revision record preserves the previous
      // output JSON exactly as it was at reopen time (output is non-null on
      // an approved phase; Revision.previousOutput is a REQUIRED Json column,
      // so the defensive default is JSON null, not DbNull).
      await tx.revision.create({
        data: {
          phaseId: phase.id,
          previousOutput: phase.output ?? Prisma.JsonNull,
          reopenedById: userId,
        },
      });
      // "Existing sign-offs on this phase are discarded" — approve AND
      // requestChanges rows; the reopened phase starts fresh in Draft.
      await tx.signoff.deleteMany({ where: { phaseId: phase.id } });
      // AC 5: the Discovery lifecycle returns to Draft; phases elsewhere
      // keep their states and sign-offs.
      await tx.discovery.update({
        where: { id: discovery.id },
        data: { lifecycleState: LifecycleState.Draft },
      });
      return { ok: true as const, phase: { id: phase.id, phaseType: parsed.data.phaseType } };
    });

    if (!result.ok) return result;

    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    revalidatePath("/");
    return result;
  } catch (error) {
    console.error("reopenPhase failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
