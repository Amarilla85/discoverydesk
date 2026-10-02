"use server";

import { revalidatePath } from "next/cache";
import { PhaseType, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { buildStateMap, computePhaseLocks } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { painGainSchema } from "@/lib/schemas/pain-gain";
import { personaSchema } from "@/lib/schemas/persona";
import { valuePropSchema } from "@/lib/schemas/value-prop";
import { businessModelSchema } from "@/lib/schemas/business-model";
import { visionSchema } from "@/lib/schemas/vision";

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
// change is the only way to change form shape. Stories 2.7–2.10 add their
// schemas here. validation_error is terminal in the auto-save retry ladder;
// form-driven saves stay schema-valid by construction, so this fires only
// for tampered/direct POSTs — that backstop is its purpose.
const PHASE_OUTPUT_SCHEMAS: Partial<Record<PhaseType, z.ZodTypeAny>> = {
  [PhaseType.Persona]: personaSchema,
  [PhaseType.PainGain]: painGainSchema,
  [PhaseType.ValueProp]: valuePropSchema,
  [PhaseType.BusinessModel]: businessModelSchema,
  [PhaseType.Vision]: visionSchema,
};

const updatePhaseSchema = z.object({
  discoveryId: z.string().min(1),
  phaseType: z.nativeEnum(PhaseType),
  output: z.string().optional(),
});

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
        select: { id: true, phases: { select: { phaseType: true, state: true } } },
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
