"use server";

import { revalidatePath } from "next/cache";
import { PhaseType } from "@prisma/client";
import { auth } from "@/lib/auth";
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

// AD-5: exactly the six PhaseType values, in canonical order. Enum values are
// referenced (not string literals) so a rename fails at compile time.
const PHASE_TYPES: PhaseType[] = [
  PhaseType.Persona,
  PhaseType.PainGain,
  PhaseType.ValueProp,
  PhaseType.BusinessModel,
  PhaseType.Vision,
  PhaseType.BusinessCase,
];

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
            create: PHASE_TYPES.map((phaseType) => ({ phaseType })),
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
