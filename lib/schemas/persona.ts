import { z } from "zod";

/*
 * Story 2.5 — Persona (Phase 1) output schema (AD-7/AD-11/ARCH-10). This file
 * is the single source of truth for the Phase 1 output shape: the same schema
 * validates in the form (components/phase/persona-form.tsx) and in the
 * updatePhase write path (actions/phases.ts). Schema change is the only way
 * to change the form shape.
 *
 * Deliberately permissive: no min-length or max-length rules exist in the MVP
 * spec (FR-7 defines no required fields), so the form state is schema-valid
 * by construction and the server's validation_error is a pure backstop
 * against tampered/direct POSTs. `.strict()` rejects scaffolding-era payloads
 * like `{ notes }` (Story 2.3) on the write path; unknown keys are discarded
 * for rendering via normalizePersonaOutput.
 */

const outcomeSchema = z.object({
  description: z.string().default(""),
  // 1-5 satisfaction score, self-assessed by the BA (FR-7, Decision
  // 2026-09-09). Default 3: a neutral midpoint that does not bake
  // "very dissatisfied" into an untouched slider.
  satisfaction: z.number().int().min(1).max(5).default(3),
});

export const personaSchema = z
  .object({
    customerName: z.string().default(""),
    roleContext: z.string().default(""),
    functionalJobs: z.array(z.string()).default([]),
    emotionalJobs: z.array(z.string()).default([]),
    socialJobs: z.array(z.string()).default([]),
    outcomes: z.array(outcomeSchema).default([]),
  })
  .strict();

export type PersonaOutput = z.infer<typeof personaSchema>;

export const PERSONA_DEFAULTS: PersonaOutput = personaSchema.parse({});

/*
 * Absorbs whatever the server holds (or a restored draft contains) into a
 * schema-valid PersonaOutput: a clean parse returns as-is; legacy or
 * partially-invalid payloads (`{ notes }` from 2.3, wrong-typed fields) keep
 * whatever fields individually parse onto the defaults, discarding unknown
 * keys. The form's initial state is therefore ALWAYS schema-valid.
 */
export function normalizePersonaOutput(raw: unknown): PersonaOutput {
  const parsed = personaSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (typeof raw !== "object" || raw === null) return PERSONA_DEFAULTS;
  const obj = raw as Record<string, unknown>;
  // Record view for the loop: TS cannot correlate a union key with its
  // field type inside a for-of over keyof.
  const merged = { ...PERSONA_DEFAULTS } as Record<keyof PersonaOutput, unknown>;
  for (const key of Object.keys(PERSONA_DEFAULTS) as Array<keyof PersonaOutput>) {
    const field = personaSchema.shape[key].safeParse(obj[key]);
    if (field.success) merged[key] = field.data;
  }
  return merged as PersonaOutput;
}
