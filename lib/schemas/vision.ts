import { z } from "zod";

import { normalizePainGainOutput, painCombinedScore } from "./pain-gain";

/*
 * Story 2.9 — Vision and Problem Statement (Phase 5) output schema
 * (AD-7/AD-11/ARCH-10). This file is the single source of truth for the
 * Phase 5 output shape: the same schema validates in the form
 * (components/phase/vision-form.tsx) and in the updatePhase write path
 * (actions/phases.ts). Schema change is the only way to change the form
 * shape.
 *
 * Unlike the 2.5–2.8 sibling schemas this one is NOT permissive: FR-11 fixes
 * hard limits ("Vision field accepts up to 200 characters; problem statement
 * field accepts up to 1,000") and UX-DR11 requires the submit blocked at
 * 100%. The .max() rules here are that enforcement's backend — the write
 * path's validation_error is not merely a tampered-POST backstop but the
 * gate Story 2.11's Submit flow trips. No min() and no required fields exist
 * in any AC (empty is valid), and there is no trimming.
 *
 * AD-7: the vision lives in this JSON on the Phase record — no normalized
 * Vision table, no migration. FR-11's chip prompts (top three Phase 2 pain
 * points) are EPHEMERAL UI suggestions, not output: nothing pain-shaped is
 * ever written to Phase.output (selectTopPainSuggestions below is a pure
 * read-side selector).
 */

export const visionSchema = z
  .object({
    // FR-11 character limits; UX-DR11 "142 / 200 characters" counter +
    // blocked-at-100% submit both enforce against these numbers.
    productVision: z.string().max(200).default(""),
    problemStatement: z.string().max(1000).default(""),
  })
  .strict();

export type VisionOutput = z.infer<typeof visionSchema>;

export const VISION_DEFAULTS: VisionOutput = visionSchema.parse({});

/*
 * Absorbs whatever the server holds (or a restored draft contains) into a
 * schema-valid VisionOutput: a clean parse returns as-is; legacy or
 * partially-invalid payloads (`{ notes }` from 2.3, wrong-typed fields) keep
 * whatever fields individually parse onto the defaults, discarding unknown
 * keys. The form's initial state is therefore ALWAYS schema-valid.
 */
export function normalizeVisionOutput(raw: unknown): VisionOutput {
  const parsed = visionSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (typeof raw !== "object" || raw === null) return VISION_DEFAULTS;
  const obj = raw as Record<string, unknown>;
  // Record view for the loop: TS cannot correlate a union key with its
  // field type inside a for-of over keyof (2-5's normalize precedent).
  const merged = { ...VISION_DEFAULTS } as Record<keyof VisionOutput, unknown>;
  for (const key of Object.keys(VISION_DEFAULTS) as Array<keyof VisionOutput>) {
    const field = visionSchema.shape[key].safeParse(obj[key]);
    if (field.success) merged[key] = field.data;
  }
  return merged as VisionOutput;
}

/*
 * FR-11 / UX-DR19 chip selector: the top three Phase 2 pain points by
 * combined score, descending, as descriptions for the Vision form's chip
 * suggestions. Read-side only — consumes Phase 2's pains DIRECTLY (2-7's
 * Dev Notes reservation), never through Phase 3's output, and never
 * persists them.
 *
 * Tie-break: painCombinedScore ties keep Phase 2 insertion order (stable
 * sort) — the ordering the BA already sees in 2.6's UX-DR31 ranking bar
 * chart. Whitespace-only descriptions are not suggestions; empty/legacy
 * Phase 2 output yields [] (the form renders no chips).
 */
export function selectTopPainSuggestions(painGainRaw: unknown): string[] {
  const { pains } = normalizePainGainOutput(painGainRaw);
  return pains
    .filter((pain) => pain.description.trim() !== "")
    .sort((a, b) => painCombinedScore(b) - painCombinedScore(a))
    .slice(0, 3)
    .map((pain) => pain.description);
}
