import { z } from "zod";

import { normalizePainGainOutput } from "@/lib/schemas/pain-gain";
import { normalizePersonaOutput } from "@/lib/schemas/persona";

/*
 * Story 2.7 — Value Proposition Canvas (Phase 3) output schema (AD-7/AD-11/
 * ARCH-10). This file is the single source of truth for the Phase 3 output
 * shape: the same schema validates in the form
 * (components/phase/value-prop-form.tsx) and in the updatePhase write path
 * (actions/phases.ts). Schema change is the only way to change the form shape.
 *
 * Deliberately permissive: no min-length or max-length rules exist in the MVP
 * spec (FR-9 defines no required fields), so the form state is schema-valid
 * by construction and the server's validation_error is a pure backstop
 * against tampered/direct POSTs. `.strict()` rejects scaffolding-era payloads
 * like `{ notes }` (Story 2.3) on the write path; unknown keys are discarded
 * for rendering via normalizeValuePropOutput.
 *
 * AD-7: the canvas lives in this JSON on the Phase record — there is NO
 * normalized ValueProp table and NO linking model between Customer Profile
 * items and Value Map entries. The FR-9 gap indicator is COMPUTED, never
 * stored (unresolvedProfileItems derives from the six lists at render so it
 * can never desync), and correspondence between the two zones is textual
 * (matchesProfileItem), because the MVP has no per-item linking UI.
 */

const customerProfileSchema = z
  .object({
    gains: z.array(z.string()).default([]),
    pains: z.array(z.string()).default([]),
    jobs: z.array(z.string()).default([]),
  })
  .strict()
  .default({ gains: [], pains: [], jobs: [] });

const valueMapSchema = z
  .object({
    gainCreators: z.array(z.string()).default([]),
    painRelievers: z.array(z.string()).default([]),
    productsAndServices: z.array(z.string()).default([]),
  })
  .strict()
  .default({ gainCreators: [], painRelievers: [], productsAndServices: [] });

export const valuePropSchema = z
  .object({
    customerProfile: customerProfileSchema,
    valueMap: valueMapSchema,
  })
  .strict();

export type ValuePropOutput = z.infer<typeof valuePropSchema>;

export const VALUE_PROP_DEFAULTS: ValuePropOutput = valuePropSchema.parse({});

/*
 * The canonical Osterwalder correspondence the gap check uses: a Customer
 * Profile list is answered by exactly one Value Map list. Referenced by
 * unresolvedProfileItems (single source of the mapping — do not restate it).
 */
export const GAP_PAIRS = {
  gains: "gainCreators",
  pains: "painRelievers",
  jobs: "productsAndServices",
} as const satisfies Record<keyof ValuePropOutput["customerProfile"], keyof ValuePropOutput["valueMap"]>;

/*
 * The FR-9 "addresses" rule (story 2.7 Task 1.6 decision): correspondence is
 * textual because the MVP has no linking UI. Normalize both sides (lowercase,
 * trim, collapse internal whitespace), then match on equality OR containment
 * in either direction — a pain reliever is usually phrased as a solution
 * ("Fix slow onboarding") while the pain is a problem ("Slow onboarding"), so
 * pure equality would leave the Unresolved badge practically permanent.
 * Post-MVP the correct design is a per-item link; this is the MVP stand-in.
 */
export function matchesProfileItem(
  profileText: string,
  mapText: string,
): boolean {
  const a = profileText.toLowerCase().trim().replace(/\s+/g, " ");
  const b = mapText.toLowerCase().trim().replace(/\s+/g, " ");
  if (a === "" || b === "") return false;
  return a === b || a.includes(b) || b.includes(a);
}

/*
 * The FR-9 gap check: for each Customer Profile list, which items are NOT
 * addressed by any entry in the corresponding Value Map list (GAP_PAIRS).
 * A whitespace-only profile item is never flagged (a blank editable row is
 * not a gap); a whitespace-only Value Map entry never resolves anything.
 */
export function unresolvedProfileItems(
  output: ValuePropOutput,
): { gains: boolean[]; pains: boolean[]; jobs: boolean[] } {
  function isUnresolved(items: string[], mapEntries: string[]): boolean[] {
    return items.map(
      (item) =>
        item.trim() !== "" &&
        !mapEntries.some((entry) => matchesProfileItem(item, entry)),
    );
  }
  return {
    gains: isUnresolved(
      output.customerProfile.gains,
      output.valueMap[GAP_PAIRS.gains],
    ),
    pains: isUnresolved(
      output.customerProfile.pains,
      output.valueMap[GAP_PAIRS.pains],
    ),
    jobs: isUnresolved(
      output.customerProfile.jobs,
      output.valueMap[GAP_PAIRS.jobs],
    ),
  };
}

/*
 * True when the output carries no canvas content at all — the condition under
 * which the phase page seeds the editor from Phases 1 and 2 (Task 3.1). A
 * phase with ANY item (even a single blank row) counts as authored and never
 * re-seeds.
 */
export function isEmptyValueProp(output: ValuePropOutput): boolean {
  return (
    output.customerProfile.gains.length === 0 &&
    output.customerProfile.pains.length === 0 &&
    output.customerProfile.jobs.length === 0 &&
    output.valueMap.gainCreators.length === 0 &&
    output.valueMap.painRelievers.length === 0 &&
    output.valueMap.productsAndServices.length === 0
  );
}

/*
 * The FR-9 pre-population seed (story 2.7 Task 3): Customer Profile from the
 * completed Persona (jobs) and Pain/Gain (gains, pains) outputs. Both raw
 * inputs go through their own normalizers, so legacy `{ notes }` scaffolding
 * shapes seed an empty profile instead of crashing. Whitespace-only source
 * strings are dropped; order is preserved (functional → emotional → social
 * for jobs); no deduping — the profile mirrors the source rows 1:1. The
 * Value Map always starts empty: the BA authors it.
 *
 * Persona's desired-outcome rows (`outcomes`) are deliberately NOT pulled
 * into gains — the seed maps Phase 2's gain descriptions only (story 2.7
 * Task 3.2c decision); extending the seed to outcomes is a spec change,
 * not a bug fix.
 */
export function seedValuePropFromPrior(
  personaRaw: unknown,
  painGainRaw: unknown,
): ValuePropOutput {
  const persona = normalizePersonaOutput(personaRaw);
  const painGain = normalizePainGainOutput(painGainRaw);
  const notBlank = (s: string) => s.trim() !== "";
  return valuePropSchema.parse({
    customerProfile: {
      gains: painGain.gains.map((g) => g.description).filter(notBlank),
      pains: painGain.pains.map((p) => p.description).filter(notBlank),
      jobs: [
        ...persona.functionalJobs,
        ...persona.emotionalJobs,
        ...persona.socialJobs,
      ].filter(notBlank),
    },
    valueMap: {},
  });
}

/*
 * Absorbs whatever the server holds (or a restored draft contains) into a
 * schema-valid ValuePropOutput: a clean parse returns as-is; legacy or
 * partially-invalid payloads (`{ notes }` from 2.3, wrong-typed fields) keep
 * whatever fields individually parse onto the defaults, discarding unknown
 * keys. The form's initial state is therefore ALWAYS schema-valid.
 */
export function normalizeValuePropOutput(raw: unknown): ValuePropOutput {
  const parsed = valuePropSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (typeof raw !== "object" || raw === null) return VALUE_PROP_DEFAULTS;
  const obj = raw as Record<string, unknown>;
  // Record view for the loop: TS cannot correlate a union key with its
  // field type inside a for-of over keyof (2-5's normalize precedent).
  const merged = {
    ...VALUE_PROP_DEFAULTS,
  } as Record<keyof ValuePropOutput, unknown>;
  for (const key of Object.keys(VALUE_PROP_DEFAULTS) as Array<keyof ValuePropOutput>) {
    const field = valuePropSchema.shape[key].safeParse(obj[key]);
    if (field.success) merged[key] = field.data;
  }
  return merged as ValuePropOutput;
}
