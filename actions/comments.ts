"use server";

import { revalidatePath } from "next/cache";
import { LifecycleState } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createCommentSchema,
  setCommentResolvedSchema,
} from "@/lib/schemas/comment";

// Story 3.2 (FR14) — the phase-comment Server Actions (AD-10): the
// Capability→Architecture Map assigns "Phase commenting (FR-14)" to exactly
// this file. Conventions mirror actions/phases.ts / actions/discoveries.ts:
// AD-12 typed envelope, snake_case codes, never a raw throw to the client,
// server-side console.error for diagnosis, and the owner-or-collaborator
// filter as the real access boundary (non-member and not-found are
// indistinguishable — never a 403 that leaks existence).
//
// Error-code vocabulary (AD-12, snake_case):
// - auth_required     — no session (envelope, never a redirect)
// - validation_error  — Zod backstop for tampered/direct requests
// - not_found         — discovery/phase/comment missing OR the viewer is not
//                       a member (indistinguishable by design, 2.4 precedent)
// - not_permitted     — resolve granted to the comment author or the
//                       Discovery Owner only (FR14)
// - discovery_approved— an Approved Discovery freezes the thread (EXPERIENCE.md
//                       lifecycle table: "No new comments can be added."); the
//                       message mirrors updatePhase's approved-lock copy
// - server_error      — catch-all; the real cause goes to the server logs
//
// DELIBERATE OMISSION — the ARCH-8 phase gate does NOT apply here: comments
// are not phase-output writes. PRD FR-14 grants "Any Collaborator" commenting
// on "any Phase Output" with no gate; the ONLY state restriction is the
// Approved-Discovery freeze above. A locked phase's comment section is never
// rendered (the page renders no content for locked phases), so the UI cannot
// reach one anyway, and a direct POST commenting on a locked phase is
// permitted by spec.
//
// THE POLLING SEAM (story Dev Notes): every successful mutation ALSO writes
// Phase.updatedById in the SAME transaction — a touch-bump that advances
// Phase.updatedAt without touching output. getCollabSnapshot's change probe
// (max phase updatedAt > since) then fires the existing silent-refresh
// revalidation, delivering fresh server-rendered comments as props to the
// thread island, and the editor's/sign-off host's "Updated by {name}." toast
// attributes the comment (EXPERIENCE.md comment auto-refresh indicator, via
// the 2.4 machinery). A torn bump would desync the poll's change detection
// from the actual data — same transaction, always.

export type CommentActionState =
  | { ok: true; comment: { id: string } }
  | { ok: false; error: { code: string; message: string; field?: string } };

// FR14: "Any Collaborator can add a comment to any Phase Output" — both roles
// (BA and Stakeholder), any unlocked phase, any phase state short of an
// Approved DISCOVERY. Access is the owner-or-collaborator filter only.
export async function createComment(
  _prevState: CommentActionState | null,
  formData: FormData,
): Promise<CommentActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = createCommentSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    phaseType: formData.get("phaseType") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid comment.",
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
        select: { id: true, lifecycleState: true },
      });
      if (!discovery) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Discovery not found." },
        };
      }
      // Approved Discovery → the thread is frozen (EXPERIENCE.md lifecycle).
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
      const phase = await tx.phase.findUnique({
        where: {
          discoveryId_phaseType: {
            discoveryId: discovery.id,
            phaseType: parsed.data.phaseType,
          },
        },
        select: { id: true },
      });
      if (!phase) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Phase not found." },
        };
      }

      const comment = await tx.comment.create({
        data: {
          phaseId: phase.id,
          authorId: userId,
          body: parsed.data.body,
        },
        select: { id: true },
      });
      // The polling seam (see file header): advance the phase's updatedAt so
      // collaborators' 10-second polls detect the new comment.
      await tx.phase.update({
        where: { id: phase.id },
        data: { updatedById: userId },
      });
      return { ok: true as const, comment: { id: comment.id } };
    });

    if (!result.ok) return result;

    // Same-flight refresh of the workspace (the island's list is server-fed).
    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    return result;
  } catch (error) {
    console.error("createComment failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}

// FR14: only the comment's author or the Discovery Owner may resolve (or
// unresolve — EXPERIENCE.md Comment States) a comment. Everything else mirrors
// createComment: access filter, approved-freeze backstop, touch-bump, catch-all.
export async function setCommentResolved(
  _prevState: CommentActionState | null,
  formData: FormData,
): Promise<CommentActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      error: { code: "auth_required", message: "You must be signed in." },
    };
  }

  const parsed = setCommentResolvedSchema.safeParse({
    discoveryId: formData.get("discoveryId") ?? "",
    phaseType: formData.get("phaseType") ?? "",
    commentId: formData.get("commentId") ?? "",
    resolved: formData.get("resolved") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: parsed.error.errors[0]?.message ?? "Invalid resolve request.",
        field: parsed.error.errors[0]?.path[0]?.toString(),
      },
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const discovery = await tx.discovery.findFirst({
        where: {
          id: parsed.data.discoveryId,
          OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }],
        },
        select: { id: true, ownerId: true, lifecycleState: true },
      });
      if (!discovery) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Discovery not found." },
        };
      }
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
      // The comment must belong to a phase of THIS discovery — scoping by
      // commentId alone would let a member resolve another discovery's
      // comment they happen to know the id of.
      const comment = await tx.comment.findFirst({
        where: {
          id: parsed.data.commentId,
          phase: { discoveryId: discovery.id },
        },
        select: { id: true, authorId: true, phaseId: true },
      });
      if (!comment) {
        return {
          ok: false as const,
          error: { code: "not_found", message: "Comment not found." },
        };
      }
      if (comment.authorId !== userId && discovery.ownerId !== userId) {
        return {
          ok: false as const,
          error: {
            code: "not_permitted",
            message:
              "Only the comment author or the Discovery Owner can resolve comments.",
          },
        };
      }

      await tx.comment.update({
        where: { id: comment.id },
        data: { resolved: parsed.data.resolved },
      });
      // Same polling seam as createComment (file header).
      await tx.phase.update({
        where: { id: comment.phaseId },
        data: { updatedById: userId },
      });
      return { ok: true as const, comment: { id: comment.id } };
    });

    if (!result.ok) return result;

    revalidatePath(`/discoveries/${parsed.data.discoveryId}`);
    return result;
  } catch (error) {
    console.error("setCommentResolved failed:", error);
    return {
      ok: false,
      error: {
        code: "server_error",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
