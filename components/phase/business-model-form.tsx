"use client";

import { useCallback, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  computeGrossMargin,
  normalizeBusinessModelOutput,
  type BusinessModelOutput,
} from "@/lib/schemas/business-model";

/*
 * Story 2.8 — the Business Model Canvas (Phase 4) form (FR-10, ACs 1–4).
 * Fourth real phase form: replaces the 2.3 scaffolding Notes surface for
 * BusinessModel only (phase-editor.tsx swaps on phaseType). Structurally the
 * simplest phase form: nine scalar blocks, no lists, no sliders, no seed, no
 * gap check — FR-10 defines NO pre-population (the phase page is untouched)
 * and the UX-DR29 gross margin derives from the two numeric fields alone.
 *
 * State contract with hooks/use-auto-save.ts (story 2.5–2.7 Dev Notes):
 * - RHF owns field state; useAutoSave owns persistence. Seeding happens once
 *   at mount from `output` via normalizeBusinessModelOutput. The `output`
 *   prop never re-seeds RHF afterwards: a server adoption arrives via a
 *   keyed remount (phase-editor.tsx), which also re-seeds the two raw-string
 *   numeric buffers below (useState initializers read the output prop).
 * - The form is fully CONTROLLED through one funnel: every edit writes RHF
 *   state (setValue, event context — lint-safe) and pushes the complete next
 *   value to onOutputChange (the editor's setOutput → the 500ms debounced
 *   save). No RHF watch() render callback (react-hooks/incompatible-library)
 *   — state is read through useWatch, and a serialized dedupe in push
 *   prevents resets/remounts from scheduling phantom saves.
 * - The UX-DR29 gross margin derives from the SAME watch state, so it
 *   appears, changes, and disappears on keystroke (AC 3) — before any save.
 *   It is computed, never stored (2.6's painCombinedScore principle), and
 *   never blocks saving: FR-10 defines no completeness gate.
 */

// UX-DR10 inputs: rounded-sm, outline border, surface fill (the phase-form
// textarea precedent). BMC blocks are content areas, not 40px list rows —
// min-h-20 gives the canvas feel (visual call flagged for Mar).
const blockTextareaClasses =
  "min-h-20 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";
const numericInputClasses =
  "h-10 w-full rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";

// The nine blocks in DOM order = the epics AC 1 arrangement (top row KP/KA/KR,
// middle CR/VP/CH, bottom CS/Cost/Revenue — a literal 3x3 per the AC, which
// intentionally differs from the classic Osterwalder print layout). Titles
// are the spec nouns (UX-DR25).
const NUMERIC_BLOCK_KEYS = ["costStructure", "revenueStreams"] as const;
type NumericBlockKey = (typeof NUMERIC_BLOCK_KEYS)[number];
type NarrativeKey = Exclude<keyof BusinessModelOutput, NumericBlockKey>;

const BLOCKS: Array<{ key: keyof BusinessModelOutput; title: string }> = [
  { key: "keyPartners", title: "Key Partners" },
  { key: "keyActivities", title: "Key Activities" },
  { key: "keyResources", title: "Key Resources" },
  { key: "customerRelationships", title: "Customer Relationships" },
  { key: "valueProposition", title: "Value Proposition" },
  { key: "channels", title: "Channels" },
  { key: "customerSegments", title: "Customer Segments" },
  { key: "costStructure", title: "Cost Structure" },
  { key: "revenueStreams", title: "Revenue Streams" },
];

const NUMERIC_LABELS: Record<NumericBlockKey, string> = {
  costStructure: "Cost, numeric",
  revenueStreams: "Revenue, numeric",
};

/*
 * Raw string → schema numeric: empty/whitespace means "not entered" (null),
 * a finite number parses, anything else mid-typing ("-", "1e") pushes null
 * until it becomes a finite number. Null is NOT 0 — a typed 0 participates
 * in the gross margin (story Task 1.5 decision).
 */
function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function BusinessModelForm({
  output,
  onOutputChange,
}: {
  output: unknown;
  onOutputChange: (next: BusinessModelOutput) => void;
}) {
  const initial = normalizeBusinessModelOutput(output);
  const { control, setValue } = useForm<BusinessModelOutput>({
    defaultValues: initial,
  });
  // Render-scope view of the form state (re-seeds only on remount — the
  // output prop is intentionally not re-synced into RHF, see header).
  const watched = useWatch({ control });
  const current = normalizeBusinessModelOutput(watched);

  // Raw-string typing buffers for the two numeric inputs (story Task 2.4
  // decision): `type="number"` fires "" for mid-typing states ("-", "1.")
  // which would eat keystrokes against a number|null field. Seeded from the
  // mount-time output; a keyed remount (server adoption) recreates them.
  const [costRaw, setCostRaw] = useState(() =>
    initial.costStructure.numeric === null
      ? ""
      : String(initial.costStructure.numeric),
  );
  const [revenueRaw, setRevenueRaw] = useState(() =>
    initial.revenueStreams.numeric === null
      ? ""
      : String(initial.revenueStreams.numeric),
  );

  const lastPushedRef = useRef<string | null>(null);
  const push = useCallback(
    (next: BusinessModelOutput) => {
      const json = JSON.stringify(next);
      if (json === lastPushedRef.current) return;
      lastPushedRef.current = json;
      onOutputChange(next);
    },
    [onOutputChange],
  );

  const setNarrative = useCallback(
    (key: NarrativeKey, value: string) => {
      setValue(key, value, { shouldDirty: true });
      push({ ...current, [key]: value });
    },
    [current, push, setValue],
  );

  // The two numeric blocks' textareas bind to the zone's `.text` subfield —
  // `text` and `numeric` are independent (story Task 1.2): typing prose here
  // must keep `numeric` untouched and the zone object schema-shaped (2-8
  // review: binding the textarea to the whole zone corrupted the output and
  // tripped the server's terminal validation_error).
  const setZoneText = useCallback(
    (key: NumericBlockKey, value: string) => {
      const zone = { ...current[key], text: value };
      setValue(key, zone, { shouldDirty: true });
      push({ ...current, [key]: zone });
    },
    [current, push, setValue],
  );

  const setNumeric = useCallback(
    (key: NumericBlockKey, raw: string, numeric: number | null) => {
      if (key === "costStructure") setCostRaw(raw);
      else setRevenueRaw(raw);
      setValue(key, { ...current[key], numeric }, { shouldDirty: true });
      push({ ...current, [key]: { ...current[key], numeric } });
    },
    [current, push, setValue],
  );

  // UX-DR29 gross margin — derived at render, never stored, never blocking.
  const grossMargin = computeGrossMargin(
    current.revenueStreams.numeric,
    current.costStructure.numeric,
  );

  return (
    <div>
      {/* Nine-block 3x3 canvas (DESIGN.md Phase 4 spec): single-column stack
          below md (2-6/2-7's documented mobile decision carried forward). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {BLOCKS.map((block) => {
          const isNumeric = NUMERIC_BLOCK_KEYS.includes(
            block.key as NumericBlockKey,
          );
          return (
            <section
              key={block.key}
              className="rounded-lg border border-outline-variant p-6 hover:bg-hover-overlay"
            >
              <h4 className="text-label text-on-surface">{block.title}</h4>
              <textarea
                rows={1}
                aria-label={block.title}
                value={
                  isNumeric
                    ? current[block.key as NumericBlockKey].text
                    : (current[block.key] as string)
                }
                onChange={(e) =>
                  isNumeric
                    ? setZoneText(block.key as NumericBlockKey, e.target.value)
                    : setNarrative(block.key as NarrativeKey, e.target.value)
                }
                className={`mt-3 ${blockTextareaClasses}`}
              />
              {isNumeric ? (
                <div className="mt-3">
                  <label
                    htmlFor={`${block.key}-numeric`}
                    className="text-label text-on-surface"
                  >
                    {NUMERIC_LABELS[block.key as NumericBlockKey]}
                  </label>
                  <input
                    id={`${block.key}-numeric`}
                    type="text"
                    inputMode="decimal"
                    aria-label={NUMERIC_LABELS[block.key as NumericBlockKey]}
                    value={
                      block.key === "costStructure" ? costRaw : revenueRaw
                    }
                    onChange={(e) =>
                      setNumeric(
                        block.key as NumericBlockKey,
                        e.target.value,
                        parseNumeric(e.target.value),
                      )
                    }
                    className={`mt-1 ${numericInputClasses}`}
                  />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {grossMargin !== null ? (
        <p
          className={`mt-4 text-body-lg ${
            grossMargin > 0
              ? "text-success"
              : grossMargin < 0
                ? "text-destructive"
                : // Zero is neither green-positive nor red-negative
                  // (UX-DR29 names only the two colored cases — story
                  // Task 2.5 decision, flagged for Mar).
                  "text-on-surface"
          }`}
        >
          Gross margin: {grossMargin}
        </p>
      ) : null}
    </div>
  );
}
