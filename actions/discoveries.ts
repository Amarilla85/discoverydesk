"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  CollaboratorRole,
  LifecycleState,
  PhaseState,
} from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { PHASE_ORDER } from "@/lib/constants";
import { signInviteToken } from "@/lib/invite-token";
import { prisma } from "@/lib/prisma";
import { resolveCollaboratorRole } from "@/lib/permissions";
import { discoverySchema } from "@/lib/schemas/discovery";
import { inviteLinkSchema, inviteSchema } from "@/lib/schemas/invite";

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
 * but as implemented phases are approved by a Stakeholder or the Owner
 * (post-MVP change, Mar 2026-10-05 — approvePhase's grant), so every phase
 * Approved ⟺ every phase has an approve sign-off — keep ONE gate
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

/*
 * Story 2.14 (UX-DR6, AD-10/11/12) — inline rename from the workspace top
 * bar. Validation is the SAME discoverySchema the create form uses (AD-11:
 * trim, required, ≤100 chars) — the schema is untouched. Permission: Owner
 * or BA Collaborator, resolved through resolveCollaboratorRole (the single
 * rule in lib/permissions.ts; the Owner always resolves to BA). A member
 * without the BA grant gets `forbidden`; a non-member gets `not_found`
 * (same no-existence-leak rule as approveDiscovery's access filter).
 *
 * New envelope codes this story: `forbidden` (member without the grant) and
 * `conflict` (the name changed under the editor — the conditional updateMany
 * below rides the stale name in its WHERE, the 2.11/2.12 race pattern, so
 * the loser matches 0 rows; the freshly-loaded name rides along so the
 * client can reset its draft). `validation_error` on the name is a
 * tampered-POST backstop — the client pre-validates empty input inline.
 */
export type RenameDiscoveryState =
  | { ok: true; discovery: { id: string; name: string } }
  | {
      ok: false;
      // `conflict` + `currentName` ride only the `conflict` error — the
      // client resets its draft to the server's current name.
      conflict?: boolean;
      currentName?: string;
      error: { code: string; message: string; field?: string };
    };

const renameDiscoverySchema = z.object({
  discoveryId: z.string().min(1),
});

export async function renameDiscovery(
  _prevState: RenameDiscoveryState | null,
  formData: FormData,
): Promise<RenameDiscoveryState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsedEnvelope = renameDiscoverySchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
  });
  if (!parsedEnvelope.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Invalid rename request.",
        field: "name",
      },
    };
  }

  const parsedName = discoverySchema.safeParse(formData.get("name") ?? "");
  if (!parsedName.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsedName.error.errors[0]?.message ?? "Name is required.",
        field: "name",
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Access check (owner or collaborator) before anything else touches data.
      const discovery = await tx.discovery.findFirst({
        where: {
          id: parsedEnvelope.data.discoveryId,
          OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          collaborators: { select: { userId: true, role: true } },
        },
      });
      if (!discovery) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Discovery not found." },
        };
      }

      // The rename grant: Owner or BA Collaborator (AC 5 — matching the
      // phase-editing permission model; resolveCollaboratorRole is the rule).
      const viewerRole = resolveCollaboratorRole({
        isOwner: discovery.ownerId === userId,
        collaboratorRole:
          discovery.collaborators.find((c) => c.userId === userId)?.role ??
          null,
      });
      if (viewerRole !== "BA") {
        return {
          ok: false as const,
          error: {
            code: "forbidden",
            message:
              "Only the Owner or a BA Collaborator can rename a Discovery.",
          },
        };
      }

      // Conditional write: the stale name rides in the WHERE, so a rename
      // that raced another writer matches 0 rows instead of clobbering it.
      const updated = await tx.discovery.updateMany({
        where: { id: discovery.id, name: discovery.name },
        data: { name: parsedName.data },
      });
      if (updated.count === 0) {
        const current = await tx.discovery.findUnique({
          where: { id: discovery.id },
          select: { name: true },
        });
        return {
          ok: false as const,
          conflict: true as const,
          currentName: current?.name ?? discovery.name,
          error: {
            code: "conflict",
            message: "The Discovery was renamed by someone else.",
          },
        };
      }
      return {
        ok: true as const,
        discovery: { id: discovery.id, name: parsedName.data },
      };
    });

    if (!result.ok) return result;

    // Refresh the workspace phase pages (the top bar name) and the list.
    revalidatePath(`/discoveries/${parsedEnvelope.data.discoveryId}`);
    revalidatePath("/");

    return result;
  } catch (error) {
    console.error("renameDiscovery failed:", error);
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
 * Story 2.14 (ACs 7/8, AD-10/12) — Discovery delete, Owner-only. The write
 * is ONE `deleteMany` (Owner rides in the WHERE — the server-side ownership
 * check and the delete are the same statement) inside `$transaction`; the
 * DB's ON DELETE CASCADE constraints (verified in
 * prisma/migrations/20260924123250_init_models/migration.sql:203,206,215,
 * 224,230 — Phase, Collaborator from Discovery; Comment, Signoff, Revision
 * from Phase) remove every child row atomically. NOTE: the epic's AC 8 says
 * "the schema has no cascade delete — child rows must be removed first";
 * that premise is stale for this codebase — the single delete IS the
 * single-transaction intent, and explicit child-then-parent choreography
 * would be redundant (deviation documented in the story's Completion Notes).
 *
 * A collaborator (even a BA) gets `not_found` — AC 6 grants delete to the
 * Owner alone, and a not-found that leaks nothing is the established
 * access-failure shape.
 */
const deleteDiscoverySchema = z.object({
  discoveryId: z.string().min(1),
});

export type DeleteDiscoveryState =
  | { ok: true; discovery: { id: string } }
  | { ok: false; error: { code: string; message: string; field?: string } };

export async function deleteDiscovery(
  _prevState: DeleteDiscoveryState | null,
  formData: FormData,
): Promise<DeleteDiscoveryState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = deleteDiscoverySchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Invalid delete request.",
        field: "discoveryId",
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.discovery.deleteMany({
        where: { id: parsed.data.discoveryId, ownerId: userId },
      });
      if (deleted.count === 0) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Discovery not found." },
        };
      }
      return { ok: true as const, discovery: { id: parsed.data.discoveryId } };
    });

    if (!result.ok) return result;

    // The list is the only surface that showed it (the workspace route now
    // 404s through the access filter); nothing else to revalidate.
    revalidatePath("/");

    return result;
  } catch (error) {
    console.error("deleteDiscovery failed:", error);
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
 * Story 3.1 (FR3, UX-DR14, AD-10/11/12) — invite a collaborator by email.
 * The write creates (or re-uses) a PENDING Collaborator row — userId stays
 * null until the invitee's first magic-link sign-in claims it (the claim
 * hook lives in lib/auth.ts's events.signIn; the schema's nullable userId +
 * @@unique([discoveryId, email]) were designed for this in Story 1.1 — no
 * Invitation table, no token: the magic link itself proves email ownership).
 *
 * The invite EMAIL is deliberately NOT sent here: the sheet island triggers
 * the standard NextAuth magic-link flow (signIn("email", { email,
 * callbackUrl })) after this action commits — the verification URL embeds
 * callbackUrl, so the email link lands on the invited Discovery. See the
 * invite-sheet component comment for the full rationale (no custom email
 * code, no duplicated token hashing).
 *
 * Validation is inviteSchema (AD-11): the email reuses signInSchema, whose
 * trim().toLowerCase() also satisfies the 1-1 review defer "normalize
 * Collaborator email to lowercase on create" — a mixed-case row would never
 * be claimed. Role rides the Prisma enum, never a string literal.
 *
 * Permission: Owner or BA Collaborator (AC 5, resolveCollaboratorRole is the
 * rule) — a member without the BA grant gets `forbidden`; a non-member gets
 * `not_found` (no-existence-leak, same as rename/approve).
 *
 * `conflict` (extended this story): inviting the Discovery's own owner email
 * — the owner has no Collaborator row by design ("ownership IS the BA
 * grant"), so without this guard the upsert below would create a self-invite.
 * `update: {}` in the upsert is intentional: re-inviting an existing row
 * (claimed or pending) re-sends the email but never resurrects or changes a
 * claimed role — role management is post-MVP.
 */
export type InviteCollaboratorState =
  | { ok: true; invite: { email: string; role: CollaboratorRole } }
  | { ok: false; error: { code: string; message: string; field?: string } };

export async function inviteCollaborator(
  _prevState: InviteCollaboratorState | null,
  formData: FormData,
): Promise<InviteCollaboratorState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = inviteSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message:
          parsed.error.errors[0]?.message ??
          "Please enter a valid email address.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Access check (owner or collaborator) before anything else touches
      // data; owner.email feeds the self-invite guard below.
      const discovery = await tx.discovery.findFirst({
        where: {
          id: parsed.data.discoveryId,
          OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
        },
        select: {
          id: true,
          ownerId: true,
          owner: { select: { email: true } },
          collaborators: { select: { userId: true, role: true } },
        },
      });
      if (!discovery) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Discovery not found." },
        };
      }

      // The invite grant: Owner or BA Collaborator (AC 5 — matching the
      // rename and phase-editing permission model).
      const viewerRole = resolveCollaboratorRole({
        isOwner: discovery.ownerId === userId,
        collaboratorRole:
          discovery.collaborators.find((c) => c.userId === userId)?.role ??
          null,
      });
      if (viewerRole !== "BA") {
        return {
          ok: false as const,
          error: {
            code: "forbidden",
            message:
              "Only the Owner or a BA Collaborator can invite collaborators.",
          },
        };
      }

      // The owner already has full access without a Collaborator row; an
      // upsert here would create a meaningless self-invite.
      if (parsed.data.email === discovery.owner.email?.toLowerCase()) {
        return {
          ok: false as const,
          error: {
            code: "conflict",
            message: "This person already has access.",
          },
        };
      }

      // Pending row (userId null until claim) or no-op re-use of the
      // existing row — the compound unique makes "no duplicate" structural.
      await tx.collaborator.upsert({
        where: {
          discoveryId_email: {
            discoveryId: discovery.id,
            email: parsed.data.email,
          },
        },
        create: {
          discoveryId: discovery.id,
          email: parsed.data.email,
          role: parsed.data.role,
          invitedById: userId,
        },
        update: {},
      });

      return {
        ok: true as const,
        invite: { email: parsed.data.email, role: parsed.data.role },
      };
    });

    if (!result.ok) return result;

    // Refresh the workspace phase pages — the invite sheet's server-rendered
    // collaborator list rides the same flight as the toast.
    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);

    return result;
  } catch (error) {
    console.error("inviteCollaborator failed:", error);
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
 * Story 4.1 (FR3, Decision 2026-10-09, AD-2 override) — generate a
 * role-encoded invite link. The magic-link email no longer transports the
 * invite (Resend's unverified-domain restriction delivers to the Owner only):
 * instead the caller gets a `{origin}/invite/{token}` URL to share through
 * their own channels (Slack, their own mail client). The token is stateless —
 * HMAC-signed payload encoding discoveryId + role + expiry, signed with
 * AUTH_SECRET (lib/invite-token.ts; no Invitation table, no DB write here).
 *
 * The invitee redeems the token at signup (app/invite/[token] →
 * signUpWithInvite in actions/auth.ts): email + password account, then a
 * claimed Collaborator row at the token's role. No pending row is created —
 * the legacy inviteCollaborator flow above stays for pre-existing pending
 * rows (claimed via magic-link sign-in, lib/auth.ts events.signIn).
 *
 * Permission: identical to inviteCollaborator — Owner or BA Collaborator
 * (`resolveCollaboratorRole` is the rule); others get `forbidden` /
 * `not_found` (no existence leak). Story 4.2 extends the grant to guests
 * (Stakeholder-role links only) — this action intentionally does NOT
 * special-case guests yet; the guest story owns that change.
 *
 * No revalidatePath: nothing server-rendered changes (the sheet's UI state
 * is client-side). No DB write: the token is pure HMAC (see
 * lib/invite-token.ts for the revocation/expiry tradeoffs, accepted for the
 * test phase).
 */
export type InviteLinkState =
  | { ok: true; url: string }
  | { ok: false; error: { code: string; message: string; field?: string } };

export async function generateInviteLink(
  _prevState: InviteLinkState | null,
  formData: FormData,
): Promise<InviteLinkState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = inviteLinkSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Invalid invite request.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    // Same access filter + BA gate as inviteCollaborator (one query, read-only).
    const discovery = await prisma.discovery.findFirst({
      where: {
        id: parsed.data.discoveryId,
        OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
      },
      select: {
        ownerId: true,
        collaborators: { select: { userId: true, role: true } },
      },
    });
    if (!discovery) {
      return {
        ok: false,
        error: { code: "not_found", message: "Discovery not found." },
      };
    }
    const viewerRole = resolveCollaboratorRole({
      isOwner: discovery.ownerId === userId,
      collaboratorRole:
        discovery.collaborators.find((c) => c.userId === userId)?.role ?? null,
    });
    if (viewerRole !== "BA") {
      return {
        ok: false,
        error: {
          code: "forbidden",
          message:
            "Only the Owner or a BA Collaborator can invite collaborators.",
        },
      };
    }

    const token = signInviteToken({
      discoveryId: parsed.data.discoveryId,
      kind: "collaborator",
      role: parsed.data.role,
    });
    // Build the absolute URL from the request headers (never a hardcoded
    // origin — the AUTH_URL lesson from 1.2). Behind Railway's proxy the
    // proto arrives via x-forwarded-proto; fall back to http for a local
    // `next start`.
    const headerList = await headers();
    const host = headerList.get("host") ?? "localhost:3000";
    const proto = headerList.get("x-forwarded-proto") ?? "http";
    return { ok: true, url: `${proto}://${host}/invite/${token}` };
  } catch (error) {
    console.error("generateInviteLink failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
