"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { PHASE_ORDER } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { CollabResult, CollabSnapshot } from "@/lib/collab-types";

// Story 2.4 — the polling hook's data source (AD-3, AD-10): a Server Action
// serving `hooks/use-collaboration.ts`, NOT an app/api/ route (AD-10). The
// architecture seed reserves this exact file ("Polling hook data source").
//
// Conventions mirror actions/phases.ts / actions/discoveries.ts: AD-12 typed
// envelope, snake_case codes, access via the owner-or-collaborator filter
// (non-existent and forbidden are indistinguishable — never a 403), and a
// server-side console.error so production failures stay diagnosable (1.4
// review). Server Functions are reachable via direct POST — the session check
// below is the real guard; this action returns phase OUTPUTS, the most
// sensitive payload in the app, so it must never leak to a non-member.
//
// Silent-refresh mechanics: `revalidatePath` runs ONLY on a change-detected
// poll — the response then carries the re-rendered workspace RSC payload
// (stepper, badges, header) in the same roundtrip, which IS the "page content
// refreshes silently" of AC 5. Unchanged polls return `{ changed: false }`
// with no revalidation: ~90% of polls stay cheap no-ops.

const collabPollSchema = z.object({
  discoveryId: z.string().min(1),
  // The client's last-seen max phase updatedAt; absent on the baseline poll.
  sinceIso: z.string().datetime().optional(),
});

export async function getCollabSnapshot(
  discoveryId: string,
  sinceIso?: string,
): Promise<CollabResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = collabPollSchema.safeParse({ discoveryId, sinceIso });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid poll request.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    // Access check first (the poll's security boundary), separate from the
    // data fetch — the change probe below runs without shipping phase
    // outputs (2.4 review: ~90% of polls must stay cheap no-ops).
    const discovery = await prisma.discovery.findFirst({
      where: {
        id: parsed.data.discoveryId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
      select: { id: true },
    });
    if (!discovery) {
      return {
        ok: false,
        error: { code: "not_found", message: "Discovery not found." },
      };
    }

    // Change detection (NFR3 cost control): the client sends the max phase
    // updatedAt it has seen; anything at-or-before that is a no-op poll. A
    // timestamp-only probe (max > since ⟺ some row > since) answers that
    // without reading any output Json.
    const since = parsed.data.sinceIso ? new Date(parsed.data.sinceIso) : null;
    if (since !== null) {
      const newer = await prisma.phase.findFirst({
        where: {
          discoveryId: parsed.data.discoveryId,
          updatedAt: { gt: since },
        },
        select: { id: true },
      });
      if (!newer) {
        return { ok: true, changed: false };
      }
    }

    const phases = await prisma.phase.findMany({
      where: { discoveryId: parsed.data.discoveryId },
      select: {
        phaseType: true,
        state: true,
        output: true,
        updatedAt: true,
        updatedById: true,
      },
    });

    // Attribution names for whoever wrote last (User.name is nullable — fall
    // back to email; the toast copy rules live client-side in the hook/editor).
    const writerIds = [
      ...new Set(
        phases
          .map((phase) => phase.updatedById)
          .filter((id): id is string => id !== null),
      ),
    ];
    const writers =
      writerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: writerIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const nameById = new Map(
      writers.map((writer) => [writer.id, writer.name ?? writer.email ?? null]),
    );

    // Canonical phase order for a deterministic snapshot the client can diff.
    const snapshotPhases = PHASE_ORDER.map((phaseType) => {
      const row = phases.find((p) => p.phaseType === phaseType);
      return {
        phaseType,
        state: row?.state ?? "Draft",
        output: row?.output ?? null,
        updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
        updatedByName: row?.updatedById
          ? (nameById.get(row.updatedById) ?? null)
          : null,
        updatedBySelf: row?.updatedById === userId,
      };
    });
    const snapshot: CollabSnapshot = {
      capturedAt: new Date().toISOString(),
      phases: snapshotPhases,
    };

    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    return { ok: true, changed: true, snapshot };
  } catch (error) {
    // The envelope is all the client may see — the real cause goes to the
    // server logs (1.4 review precedent).
    console.error("getCollabSnapshot failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
