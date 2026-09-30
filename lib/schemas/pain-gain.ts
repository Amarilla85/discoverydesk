import { z } from "zod";

/*
 * Story 2.6 — Pain/Gain Mapping (Phase 2) output schema (AD-7/AD-11/ARCH-10).
 * This file is the single source of truth for the Phase 2 output shape: the
 * same schema validates in the form (components/phase/pain-gain-form.tsx) and
 * in the updatePhase write path (actions/phases.ts). Schema change is the only
 * way to change the form shape.
 *
 * Deliberately permissive: no min-length or max-length rules exist in the MVP
 * spec (FR-8 defines no required fields), so the form state is schema-valid
 * by construction and the server's validation_error is a pure backstop
 * against tampered/direct POSTs. `.strict()` rejects scaffolding-era payloads
 * like `{ notes }` (Story 2.3) on the write path; unknown keys are discarded
 * for rendering via normalizePainGainOutput.
 *
 * AD-7: pains and gains live in this JSON on the Phase record — there are NO
 * normalized PainPoint/GainPoint tables. Ordering is array index (FR-8's
 * "reorder" is an array mutation); the combined pain score is COMPUTED, never
 * stored (FR-8: "sum of all three dimensions" — it derives from the three
 * sliders at render time so it can never desync).
 */

const painEntrySchema = z.object({
  description: z.string().default(""),
  // FR-8 scoring dimensions, 1-5 each. Default 3: a neutral midpoint that
  // does not bake the scale floor into an untouched slider (2-5 decision).
  severity: z.number().int().min(1).max(5).default(3),
  frequency: z.number().int().min(1).max(5).default(3),
  businessImpact: z.number().int().min(1).max(5).default(3),
});

const gainEntrySchema = z.object({
  description: z.string().default(""),
  // FR-8 gives gains two dimensions and NO combined score — do not add one.
  relevance: z.number().int().min(1).max(5).default(3),
  currentSatisfaction: z.number().int().min(1).max(5).default(3),
});

export const painGainSchema = z
  .object({
    pains: z.array(painEntrySchema).default([]),
    gains: z.array(gainEntrySchema).default([]),
  })
  .strict();

export type PainEntry = z.infer<typeof painEntrySchema>;
export type GainEntry = z.infer<typeof gainEntrySchema>;
export type PainGainOutput = z.infer<typeof painGainSchema>;

export const PAIN_GAIN_DEFAULTS: PainGainOutput = painGainSchema.parse({});

/*
 * The FR-8 combined pain score: severity + frequency + business impact
 * (range 3-15). The ONLY score definition — the per-entry display and the
 * UX-DR31 ranking both derive from it; nothing score-shaped is persisted.
 */
export function painCombinedScore(
  pain: Pick<PainEntry, "severity" | "frequency" | "businessImpact">,
): number {
  return pain.severity + pain.frequency + pain.businessImpact;
}

/*
 * Absorbs whatever the server holds (or a restored draft contains) into a
 * schema-valid PainGainOutput: a clean parse returns as-is; legacy or
 * partially-invalid payloads (`{ notes }` from 2.3, wrong-typed fields) keep
 * whatever fields individually parse onto the defaults, discarding unknown
 * keys. The form's initial state is therefore ALWAYS schema-valid.
 */
export function normalizePainGainOutput(raw: unknown): PainGainOutput {
  const parsed = painGainSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (typeof raw !== "object" || raw === null) return PAIN_GAIN_DEFAULTS;
  const obj = raw as Record<string, unknown>;
  // Record view for the loop: TS cannot correlate a union key with its
  // field type inside a for-of over keyof (2-5's normalize precedent).
  const merged = { ...PAIN_GAIN_DEFAULTS } as Record<keyof PainGainOutput, unknown>;
  for (const key of Object.keys(PAIN_GAIN_DEFAULTS) as Array<keyof PainGainOutput>) {
    const field = painGainSchema.shape[key].safeParse(obj[key]);
    if (field.success) merged[key] = field.data;
  }
  return merged as PainGainOutput;
}
