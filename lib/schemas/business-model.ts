import { z } from "zod";

/*
 * Story 2.8 — Business Model Canvas (Phase 4) output schema (AD-7/AD-11/
 * ARCH-10). This file is the single source of truth for the Phase 4 output
 * shape: the same schema validates in the form
 * (components/phase/business-model-form.tsx) and in the updatePhase write
 * path (actions/phases.ts). Schema change is the only way to change the form
 * shape.
 *
 * Deliberately permissive: no min-length, max-length, or required-field rules
 * exist in the MVP spec (FR-10 defines none), so the form state is
 * schema-valid by construction and the server's validation_error is a pure
 * backstop against tampered/direct POSTs. `.strict()` rejects scaffolding-era
 * payloads like `{ notes }` (Story 2.3) on the write path; unknown keys are
 * discarded for rendering via normalizeBusinessModelOutput.
 *
 * AD-7: the canvas lives in this JSON on the Phase record — there is NO
 * normalized BusinessModel table and NO migration. The UX-DR29 gross margin
 * is COMPUTED, never stored (computeGrossMargin derives from the two numeric
 * fields at render so it can never desync). FR-10 defines NO pre-population,
 * so nothing here reads sibling phases.
 *
 * Numeric semantics (story Task 1.5 decisions): `numeric` is `number | null`
 * — `null` means "not entered" and is NOT 0 (0 is a real entered value that
 * participates in the gross margin). Any finite number is accepted, including
 * negatives and decimals (UX-DR29's red case requires a negative margin to be
 * representable); the string→number conversion lives in the form, which pushes
 * `null` for an empty or non-finite raw input.
 */

const numericFieldSchema = z
  .object({
    text: z.string().default(""),
    // .finite() mirrors the form's parseNumeric guard server-side (2-8
    // review): a direct POST sending "1e999" JSON-parses to Infinity, which
    // plain z.number() would store. Negatives/decimals stay accepted.
    numeric: z.number().finite().nullable().default(null),
  })
  .strict()
  .default({ text: "", numeric: null });

export const businessModelSchema = z
  .object({
    // Seven narrative blocks (DESIGN.md Phase 4: every block has a textarea).
    keyPartners: z.string().default(""),
    keyActivities: z.string().default(""),
    keyResources: z.string().default(""),
    valueProposition: z.string().default(""),
    customerRelationships: z.string().default(""),
    channels: z.string().default(""),
    customerSegments: z.string().default(""),
    // Revenue Streams and Cost Structure "additionally have a numeric input
    // field" (DESIGN.md Phase 4) — `text` and `numeric` are independent.
    revenueStreams: numericFieldSchema,
    costStructure: numericFieldSchema,
  })
  .strict();

export type BusinessModelOutput = z.infer<typeof businessModelSchema>;

export const BUSINESS_MODEL_DEFAULTS: BusinessModelOutput =
  businessModelSchema.parse({});

/*
 * The FR-10 / UX-DR29 gross margin: revenue minus cost, ONLY when both
 * numeric values are present (either `null` → no indicator). Computed at
 * render, never persisted, never blocking save.
 */
export function computeGrossMargin(
  revenueNumeric: number | null,
  costNumeric: number | null,
): number | null {
  if (revenueNumeric === null || costNumeric === null) return null;
  return revenueNumeric - costNumeric;
}

/*
 * Absorbs whatever the server holds (or a restored draft contains) into a
 * schema-valid BusinessModelOutput: a clean parse returns as-is; legacy or
 * partially-invalid payloads (`{ notes }` from 2.3, wrong-typed fields) keep
 * whatever fields individually parse onto the defaults, discarding unknown
 * keys. The form's initial state is therefore ALWAYS schema-valid.
 */
export function normalizeBusinessModelOutput(
  raw: unknown,
): BusinessModelOutput {
  const parsed = businessModelSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (typeof raw !== "object" || raw === null) return BUSINESS_MODEL_DEFAULTS;
  const obj = raw as Record<string, unknown>;
  // Record view for the loop: TS cannot correlate a union key with its
  // field type inside a for-of over keyof (2-5's normalize precedent).
  const merged = {
    ...BUSINESS_MODEL_DEFAULTS,
  } as Record<keyof BusinessModelOutput, unknown>;
  for (const key of Object.keys(
    BUSINESS_MODEL_DEFAULTS,
  ) as Array<keyof BusinessModelOutput>) {
    const field = businessModelSchema.shape[key].safeParse(obj[key]);
    if (field.success) merged[key] = field.data;
  }
  return merged as BusinessModelOutput;
}
