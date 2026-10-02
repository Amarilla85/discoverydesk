"use client";

import { useCallback, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  normalizeVisionOutput,
  type VisionOutput,
} from "@/lib/schemas/vision";

/*
 * Story 2.9 — the Vision and Problem Statement (Phase 5) form (FR-11, ACs
 * 1–6). Fifth real phase form: replaces the 2.3 scaffolding Notes surface
 * for Vision only (phase-editor.tsx swaps on phaseType). Like 2.8, the
 * plainest form shape — two scalar fields, no lists, no sliders — plus two
 * codebase firsts:
 * - The UX-DR11 character counters ("142 / 200 characters", destructive at
 *   90% of the limit) — the first counters in any phase form.
 * - The UX-DR19 top-3 pain-point chip suggestions (FR-11): EPHEMERAL UI
 *   prompts that arrive via the `suggestedPains` prop (composed server-side
 *   in the phase page) and are never written to Phase.output — hence a prop
 *   instead of 2.7's seed-into-initialOutput, which would persist them.
 *
 * State contract with hooks/use-auto-save.ts (the 2.5–2.8 funnel):
 * - RHF owns field state; useAutoSave owns persistence. Seeding happens once
 *   at mount from `output` via normalizeVisionOutput. The `output` prop never
 *   re-seeds RHF afterwards: a server adoption arrives via a keyed remount
 *   (phase-editor.tsx).
 * - The form is fully CONTROLLED through one funnel: every edit writes RHF
 *   state (setValue, event context — lint-safe) and pushes the complete next
 *   value to onOutputChange (the editor's setOutput → the 500ms debounced
 *   save). No form-level save timer, draft key, or indicator — AC 6 rides
 *   the 2.3 engine unchanged.
 */

// UX-DR10 inputs (40px single-line / 80px textarea). The limits mirror the
// schema's .max() rules — the schema stays authoritative: a mismatch can
// only surface as the write path's validation_error, and the schema QA
// asserts the exact boundary values.
const PRODUCT_VISION_LIMIT = 200;
const PROBLEM_STATEMENT_LIMIT = 1000;
// UX-DR11 "reaches 90% of the limit" — precomputed integer thresholds
// instead of limit * 0.9: floating-point multiplication (200 * 0.9 ===
// 180.00000000000003) would MISS the exact-90% keystroke.
const PRODUCT_VISION_WARNING_AT = 180;
const PROBLEM_STATEMENT_WARNING_AT = 900;

const textInputClasses =
  "h-10 w-full rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";
const textareaClasses =
  "min-h-20 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";

/*
 * UX-DR11: real-time "{len} / {limit} characters", destructive at 90% of the
 * limit. Counting is value.length (UTF-16 units) to MATCH the controls'
 * maxLength attribute, which also counts UTF-16 code units — a code-point
 * count would desync the counter from the enforced truncation. tabular-nums
 * keeps the ticking digits from shifting layout. (aria-live semantics for
 * the counter are Story 2.13's aria baseline, deliberately not added here.)
 */
function CharCounter({
  length,
  limit,
  warningAt,
}: {
  length: number;
  limit: number;
  warningAt: number;
}) {
  return (
    <p
      className={`mt-1 text-right text-caption-sm tabular-nums ${
        length >= warningAt ? "text-destructive" : "text-on-surface-variant"
      }`}
    >
      {length} / {limit} characters
    </p>
  );
}

export function VisionForm({
  output,
  onOutputChange,
  suggestedPains,
}: {
  output: unknown;
  onOutputChange: (next: VisionOutput) => void;
  suggestedPains: string[];
}) {
  const initial = normalizeVisionOutput(output);
  const { control, setValue } = useForm<VisionOutput>({
    defaultValues: initial,
  });
  // Render-scope view of the form state (re-seeds only on remount — the
  // output prop is intentionally not re-synced into RHF, see header).
  const watched = useWatch({ control });
  const current = normalizeVisionOutput(watched);

  const lastPushedRef = useRef<string | null>(null);
  const push = useCallback(
    (next: VisionOutput) => {
      const json = JSON.stringify(next);
      if (json === lastPushedRef.current) return;
      lastPushedRef.current = json;
      onOutputChange(next);
    },
    [onOutputChange],
  );

  const setProductVision = useCallback(
    (value: string) => {
      setValue("productVision", value, { shouldDirty: true });
      push({ ...current, productVision: value });
    },
    [current, push, setValue],
  );

  const setProblemStatement = useCallback(
    (value: string) => {
      setValue("problemStatement", value, { shouldDirty: true });
      push({ ...current, problemStatement: value });
    },
    [current, push, setValue],
  );

  /*
   * Chip toggle (documented story decision — the spec says only "clickable
   * to insert", UJ-1 step 11). Insert: append the pain as its own line
   * (newline-joined, so the structured problem statement stays readable);
   * if the field is at its limit a chip simply cannot add more. Truncation:
   * only the slice that fits is inserted, so a truncated pain's chip stays
   * unselected against its partial line. Remove: clicking a selected chip
   * deletes the pain text plus the ONE separator that joined it to a
   * neighbour — UX-DR19's selected state must be toggle-truthful. Matching
   * is substring-based (review patch): pain descriptions are Phase 2
   * textareas and may contain newlines themselves, which exact line
   * matching never selected and re-clicking would duplicate.
   */
  const togglePain = useCallback(
    (pain: string) => {
      const statement = current.problemStatement;
      if (statement.includes(pain)) {
        const idx = statement.indexOf(pain);
        const before = statement.slice(0, idx);
        const after = statement.slice(idx + pain.length);
        const next =
          before.endsWith("\n")
            ? before.slice(0, -1) + after
            : after.startsWith("\n")
              ? before + after.slice(1)
              : before + after;
        setProblemStatement(next);
        return;
      }
      const separator = statement === "" ? "" : "\n";
      const budget = PROBLEM_STATEMENT_LIMIT - statement.length - separator.length;
      if (budget <= 0) return;
      setProblemStatement(`${statement}${separator}${pain.slice(0, budget)}`);
    },
    [current.problemStatement, setProblemStatement],
  );

  return (
    <div>
      {/* FR-11 / UX-DR19: top-3 pain-point chips ABOVE the form fields, fed
          by the phase page's server-side composition (Phase 2's output —
          read-side only, never persisted). */}
      {suggestedPains.length > 0 ? (
        <div className="mb-6">
          <p className="text-caption-sm text-on-surface-variant">
            Top pain points
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestedPains.map((pain, index) => {
              // Substring match — mirrors togglePain's removal semantics
              // (multi-line pain descriptions are possible: Phase 2's
              // description field is a textarea).
              const selected = current.problemStatement.includes(pain);
              return (
                <button
                  // Composite key: duplicate descriptions must not collide.
                  key={`${index}-${pain}`}
                  type="button"
                  onClick={() => togglePain(pain)}
                  className={`inline-flex h-7 items-center rounded-full px-3 text-body-sm transition-colors ${
                    selected
                      ? "border border-primary bg-primary-container text-on-primary-container"
                      : "border border-outline-variant bg-surface text-on-surface hover:bg-hover-overlay"
                  }`}
                >
                  {pain}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* DESIGN.md Phase 5: Product Vision is a SINGLE-LINE text input. */}
      <div>
        <label htmlFor="product-vision" className="text-label text-on-surface">
          Product Vision
        </label>
        <input
          id="product-vision"
          type="text"
          maxLength={PRODUCT_VISION_LIMIT}
          value={current.productVision}
          onChange={(e) => setProductVision(e.target.value)}
          className={`mt-1 ${textInputClasses}`}
        />
        <CharCounter
          length={current.productVision.length}
          limit={PRODUCT_VISION_LIMIT}
          warningAt={PRODUCT_VISION_WARNING_AT}
        />
      </div>

      <div className="mt-6">
        <label
          htmlFor="problem-statement"
          className="text-label text-on-surface"
        >
          Problem Statement
        </label>
        <textarea
          id="problem-statement"
          rows={3}
          maxLength={PROBLEM_STATEMENT_LIMIT}
          value={current.problemStatement}
          onChange={(e) => setProblemStatement(e.target.value)}
          className={`mt-1 ${textareaClasses}`}
        />
        <CharCounter
          length={current.problemStatement.length}
          limit={PROBLEM_STATEMENT_LIMIT}
          warningAt={PROBLEM_STATEMENT_WARNING_AT}
        />
      </div>
    </div>
  );
}
