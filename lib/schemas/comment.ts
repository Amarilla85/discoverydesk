import { PhaseType } from "@prisma/client";
import { z } from "zod";

// Story 3.2 (FR14, AD-11): the comment form's schemas — the single source of
// truth for shape AND validation, used by the comment thread island (client
// pre-validation) and the actions/comments.ts Server Actions (server
// backstop). PhaseType rides the Prisma enum — the value the Phase row is
// looked up by (discoveryId_phaseType).
//
// The 2000-character max is a tamper backstop, not a UX feature: no character
// counter is rendered (UX-DR11 counters apply to user-facing limits; none is
// spec'd for comments), so normal comments never approach it.
export const commentBaseSchema = z.object({
  discoveryId: z.string().min(1),
  phaseType: z.nativeEnum(PhaseType),
});

export const createCommentSchema = commentBaseSchema.extend({
  body: z
    .string()
    .trim()
    .min(1, "Comment is required.")
    .max(2000, "Comment must be 2,000 characters or fewer."),
});

// The resolved flag crosses the wire as a FormData string ("true"/"false");
// the transform is the only place the boolean exists.
export const setCommentResolvedSchema = commentBaseSchema.extend({
  commentId: z.string().min(1),
  resolved: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
});
