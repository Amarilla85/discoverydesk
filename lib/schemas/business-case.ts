import { z } from "zod";

/*
 * Story 2.10 — Business Case (Phase 6) output schema (AD-7/AD-11/ARCH-10).
 * This file is the single source of truth for the Phase 6 output shape: the
 * same schema validates in the form (components/phase/business-case-form.tsx)
 * and in the updatePhase write path (actions/phases.ts). Schema change is the
 * only way to change the form shape. The LAST of the six per-phase schema
 * files — the Structural Seed's lib/schemas/ directory is complete.
 *
 * Deliberately permissive like the 2.5–2.8 siblings (UNLIKE 2.9's .max()
 * deviation): no length limits exist in any AC for this phase, so the form
 * state is schema-valid by construction and the server's validation_error is
 * a pure backstop against tampered/direct POSTs. `.strict()` rejects
 * scaffolding-era payloads like `{ notes }` (Story 2.3) on the write path;
 * unknown keys are discarded for rendering via normalizeBusinessCaseOutput.
 *
 * AD-7: the business case lives in this JSON on the Phase record — success
 * metrics and key assumptions are JSON arrays, NOT normalized tables, and
 * there is NO migration. FR-12 defines no pre-population and no cross-phase
 * reads, so nothing here imports sibling schemas.
 *
 * Numeric semantics (2-8 precedent): the three Projected Impact estimates are
 * `number | null` — `null` means "not entered" and is NOT 0. `.finite()`
 * mirrors the form's parseNumeric guard server-side: a direct POST sending
 * "1e999" JSON-parses to Infinity, which plain z.number() would store.
 * Negatives and decimals stay accepted.
 */

const metricSchema = z
  .object({
    name: z.string().default(""),
    definition: z.string().default(""),
    // Free text by design: DESIGN.md's table columns are text inputs, and the
    // spec's own example values ("200 new users in 6 months") are not numbers.
    baseline: z.string().default(""),
    target: z.string().default(""),
  })
  .strict();

const assumptionSchema = z.object({
  text: z.string().default(""),
  // No spec source names a default for a newly added assumption. "Unknown"
  // is the documented story decision: the semantically honest state for an
  // unassessed assumption, and the status whose selected style is
  // deliberately un-emphasized (outline chip).
  status: z.enum(["Confirmed", "Unconfirmed", "Unknown"]).default("Unknown"),
});

export type AssumptionStatus = z.infer<typeof assumptionSchema.shape.status>;

// The chip row's render order — Confirmed first, per DESIGN.md's listing.
export const ASSUMPTION_STATUSES: AssumptionStatus[] = [
  "Confirmed",
  "Unconfirmed",
  "Unknown",
];

export const businessCaseSchema = z
  .object({
    successMetrics: z.array(metricSchema).default([]),
    investment: z
      .object({
        // A select is what DESIGN.md specifies for effort unit, but no
        // options exist in any spec — shipped as a text input (story
        // decision, flagged for Mar). A string field keeps that swap
        // contained if canonical options arrive later.
        effortUnit: z.string().default(""),
        // Free text ("6 months", EXPERIENCE.md UJ-1 step 12) — DESIGN.md's
        // "text input, format: 'X months'" wins over the epics' number input.
        duration: z.string().default(""),
        teamComposition: z.string().default(""),
      })
      .strict()
      .default({ effortUnit: "", duration: "", teamComposition: "" }),
    projectedImpact: z
      .object({
        narrative: z.string().default(""),
        // Three numerics, not one: PRD FR-12 + DESIGN.md both enumerate
        // revenue / cost reduction / strategic value (the epics' single
        // "numeric estimate" is the documented inconsistency).
        revenue: z.number().finite().nullable().default(null),
        costReduction: z.number().finite().nullable().default(null),
        strategicValue: z.number().finite().nullable().default(null),
      })
      .strict()
      .default({ narrative: "", revenue: null, costReduction: null, strategicValue: null }),
    keyAssumptions: z.array(assumptionSchema).default([]),
  })
  .strict();

export type BusinessCaseOutput = z.infer<typeof businessCaseSchema>;

export const BUSINESS_CASE_DEFAULTS: BusinessCaseOutput =
  businessCaseSchema.parse({});

/*
 * Absorbs whatever the server holds (or a restored draft contains) into a
 * schema-valid BusinessCaseOutput: a clean parse returns as-is; legacy or
 * partially-invalid payloads (`{ notes }` from 2.3, wrong-typed fields) keep
 * whatever fields individually parse onto the defaults, discarding unknown
 * keys. The form's initial state is therefore ALWAYS schema-valid.
 */
export function normalizeBusinessCaseOutput(
  raw: unknown,
): BusinessCaseOutput {
  const parsed = businessCaseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (typeof raw !== "object" || raw === null) return BUSINESS_CASE_DEFAULTS;
  const obj = raw as Record<string, unknown>;
  // Record view for the loop: TS cannot correlate a union key with its
  // field type inside a for-of over keyof (2-5's normalize precedent).
  const merged = {
    ...BUSINESS_CASE_DEFAULTS,
  } as Record<keyof BusinessCaseOutput, unknown>;
  for (const key of Object.keys(
    BUSINESS_CASE_DEFAULTS,
  ) as Array<keyof BusinessCaseOutput>) {
    const field = businessCaseSchema.shape[key].safeParse(obj[key]);
    if (field.success) merged[key] = field.data;
  }
  return merged as BusinessCaseOutput;
}
