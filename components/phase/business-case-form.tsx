"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useStableRowKeys } from "@/hooks/use-stable-row-keys";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ASSUMPTION_STATUSES,
  normalizeBusinessCaseOutput,
  type AssumptionStatus,
  type BusinessCaseOutput,
} from "@/lib/schemas/business-case";

/*
 * Story 2.10 — the Business Case (Phase 6) form (FR-12, ACs 1–3). The sixth
 * and FINAL real phase form: replaces the 2.3 scaffolding Notes surface for
 * BusinessCase only (phase-editor.tsx swaps on phaseType), retiring the
 * scaffold entirely. Structurally persona's shape (sections + the UX-DR18
 * table + an add/remove list) with 2-8's numeric inputs and 2-9's chips:
 * FR-12 defines NO pre-population and NO cross-phase data (the phase page is
 * untouched), so the prop contract is the plain PersonaForm one.
 *
 * State contract with hooks/use-auto-save.ts (story 2.5–2.9 Dev Notes):
 * - RHF owns field state; useAutoSave owns persistence. Seeding happens once
 *   at mount from `output` via normalizeBusinessCaseOutput (legacy `{ notes }`
 *   output from 2.3 renders as an empty form). The `output` prop never
 *   re-seeds RHF afterwards: a server adoption arrives via a keyed remount
 *   (phase-editor.tsx), which also re-seeds the raw-string numeric buffers
 *   below (useState initializer reads the output prop).
 * - The form is fully CONTROLLED through one funnel: every edit calls a
 *   setter that writes RHF state (setValue, event context — lint-safe) and
 *   pushes the complete next value to onOutputChange (the editor's setOutput
 *   → the 500ms debounced save). No RHF watch() render callback (react-hooks
 *   /incompatible-library): state is read through useWatch, and a serialized
 *   dedupe in push prevents resets/remounts from scheduling phantom saves.
 * - Form state is schema-valid by construction (permissive schema, enum-typed
 *   chips); the server-side validation_error backstop in actions/phases.ts is
 *   never reachable from form-driven saves.
 */

// UX-DR10 inputs: 40px height, rounded-sm, outline border, surface fill.
const inputClasses =
  "h-10 rounded-sm border border-outline bg-surface px-3 text-body text-on-surface placeholder:text-on-surface-disabled";

const textareaClasses =
  "min-h-20 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";

const assumptionTextareaClasses =
  "h-10 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";

/*
 * Raw string → schema numeric (2-8 precedent, copied verbatim): empty/
 * whitespace means "not entered" (null), a finite number parses, anything
 * else mid-typing ("-", "1e") pushes null until it becomes a finite number.
 * Null is NOT 0 — a typed 0 is a real entered value.
 */
function parseNumeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/*
 * Assumption status chip colors (AC 2). DESIGN.md's "Assumption status chips"
 * + EXPERIENCE.md's microcopy table override UX-DR19's generic primary-
 * container selected rule for these three statuses: Confirmed = green,
 * Unconfirmed = yellow, Unknown = outline (transparent background).
 * Unselected chips are muted outline-variant regardless of status. Documented
 * wrinkle: selected-Unknown differs from unselected only by text color —
 * the spec gives Unknown no fill (flagged for Mar).
 */
const STATUS_SELECTED_CLASSES: Record<AssumptionStatus, string> = {
  Confirmed: "border border-success bg-success-container text-on-success-container",
  Unconfirmed: "border border-warning bg-warning-container text-on-warning-container",
  Unknown: "border border-outline bg-surface text-on-surface",
};
const STATUS_UNSELECTED_CLASSES =
  "border border-outline-variant bg-surface text-on-surface-variant hover:bg-hover-overlay";

// The Projected Impact numeric fields (PRD FR-12 / DESIGN.md enumerate three;
// the epics' single "numeric estimate" is the documented inconsistency).
const IMPACT_NUMERIC_KEYS = ["revenue", "costReduction", "strategicValue"] as const;
type ImpactNumericKey = (typeof IMPACT_NUMERIC_KEYS)[number];

const IMPACT_NUMERIC_LABELS: Record<ImpactNumericKey, string> = {
  revenue: "Projected revenue",
  costReduction: "Cost reduction",
  strategicValue: "Strategic value",
};

// The UX-DR18 table's columns (DESIGN.md Phase 6). "Baseline value" over
// DESIGN's "Current value": the epics AC, PRD FR-12 ("current/baseline
// value") and EXPERIENCE.md's review narrative ("the baseline field is
// empty") all use baseline.
const METRIC_COLUMNS = [
  "Metric name",
  "Definition",
  "Baseline value",
  "Target value",
] as const;

export function BusinessCaseForm({
  output,
  onOutputChange,
}: {
  output: unknown;
  onOutputChange: (next: BusinessCaseOutput) => void;
}) {
  const initial = normalizeBusinessCaseOutput(output);
  const { control, setValue } = useForm<BusinessCaseOutput>({
    defaultValues: initial,
  });
  // Render-scope view of the form state (re-seeds only on remount — the
  // output prop is intentionally not re-synced into RHF, see header).
  const watched = useWatch({ control });
  const current = normalizeBusinessCaseOutput(watched);

  // Raw-string typing buffers for the three numeric inputs (2-8 precedent):
  // `type="number"` fires "" for mid-typing states ("-", "1.") which would
  // eat keystrokes against a number|null field. Seeded from the mount-time
  // output; a keyed remount (server adoption) recreates them.
  const [numericRaw, setNumericRaw] = useState<Record<ImpactNumericKey, string>>(
    () => ({
      revenue:
        initial.projectedImpact.revenue === null
          ? ""
          : String(initial.projectedImpact.revenue),
      costReduction:
        initial.projectedImpact.costReduction === null
          ? ""
          : String(initial.projectedImpact.costReduction),
      strategicValue:
        initial.projectedImpact.strategicValue === null
          ? ""
          : String(initial.projectedImpact.strategicValue),
    }),
  );

  const lastPushedRef = useRef<string | null>(null);
  const push = useCallback(
    (next: BusinessCaseOutput) => {
      const json = JSON.stringify(next);
      if (json === lastPushedRef.current) return;
      lastPushedRef.current = json;
      onOutputChange(next);
    },
    [onOutputChange],
  );

  const setSuccessMetrics = useCallback(
    (successMetrics: BusinessCaseOutput["successMetrics"]) => {
      setValue("successMetrics", successMetrics, { shouldDirty: true });
      push({ ...current, successMetrics });
    },
    [current, push, setValue],
  );

  const setInvestment = useCallback(
    <K extends keyof BusinessCaseOutput["investment"]>(
      key: K,
      value: BusinessCaseOutput["investment"][K],
    ) => {
      const investment = { ...current.investment, [key]: value };
      setValue("investment", investment, { shouldDirty: true });
      push({ ...current, investment });
    },
    [current, push, setValue],
  );

  const setImpactNarrative = useCallback(
    (narrative: string) => {
      const projectedImpact = { ...current.projectedImpact, narrative };
      setValue("projectedImpact", projectedImpact, { shouldDirty: true });
      push({ ...current, projectedImpact });
    },
    [current, push, setValue],
  );

  const setImpactNumeric = useCallback(
    (key: ImpactNumericKey, raw: string, numeric: number | null) => {
      setNumericRaw((prev) => ({ ...prev, [key]: raw }));
      const projectedImpact = { ...current.projectedImpact, [key]: numeric };
      setValue("projectedImpact", projectedImpact, { shouldDirty: true });
      push({ ...current, projectedImpact });
    },
    [current, push, setValue],
  );

  const setKeyAssumptions = useCallback(
    (keyAssumptions: BusinessCaseOutput["keyAssumptions"]) => {
      setValue("keyAssumptions", keyAssumptions, { shouldDirty: true });
      push({ ...current, keyAssumptions });
    },
    [current, push, setValue],
  );

  // Story 2.13: the two inline sections' visible h3s label their sections
  // programmatically (MetricsSection/AssumptionsSection own their ids).
  const investmentSectionId = useId();
  const impactSectionId = useId();

  return (
    <div>
      <MetricsSection
        metrics={current.successMetrics}
        setMetrics={setSuccessMetrics}
      />

      <section aria-labelledby={investmentSectionId} className="mt-8">
        <h3 id={investmentSectionId} className="text-label text-on-surface">
          Estimated investment
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-4">
          <div>
            <label htmlFor="investment-effort-unit" className="text-label text-on-surface">
              Effort unit
            </label>
            <input
              id="investment-effort-unit"
              type="text"
              autoComplete="off"
              value={current.investment.effortUnit}
              onChange={(e) => setInvestment("effortUnit", e.target.value)}
              className={`${inputClasses} mt-1 w-full`}
            />
          </div>
          <div>
            <label htmlFor="investment-duration" className="text-label text-on-surface">
              Duration
            </label>
            <input
              id="investment-duration"
              type="text"
              autoComplete="off"
              value={current.investment.duration}
              onChange={(e) => setInvestment("duration", e.target.value)}
              className={`${inputClasses} mt-1 w-full`}
            />
          </div>
          <div>
            <label htmlFor="investment-team-composition" className="text-label text-on-surface">
              Team composition
            </label>
            <input
              id="investment-team-composition"
              type="text"
              autoComplete="off"
              placeholder="e.g., 2 engineers, 1 designer, 1 QA"
              value={current.investment.teamComposition}
              onChange={(e) => setInvestment("teamComposition", e.target.value)}
              className={`${inputClasses} mt-1 w-full`}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby={impactSectionId} className="mt-8">
        <h3 id={impactSectionId} className="text-label text-on-surface">
          Projected impact
        </h3>
        <label htmlFor="impact-narrative" className="mt-3 block text-label text-on-surface">
          Projected impact narrative
        </label>
        <textarea
          id="impact-narrative"
          rows={1}
          value={current.projectedImpact.narrative}
          onChange={(e) => setImpactNarrative(e.target.value)}
          className={`${textareaClasses} mt-1`}
        />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {IMPACT_NUMERIC_KEYS.map((key) => (
            <div key={key}>
              <label
                htmlFor={`impact-${key}`}
                className="text-label text-on-surface"
              >
                {IMPACT_NUMERIC_LABELS[key]}
              </label>
              <input
                id={`impact-${key}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={numericRaw[key]}
                onChange={(e) =>
                  setImpactNumeric(key, e.target.value, parseNumeric(e.target.value))
                }
                className={`${inputClasses} mt-1 w-full`}
              />
            </div>
          ))}
        </div>
      </section>

      <AssumptionsSection
        assumptions={current.keyAssumptions}
        setAssumptions={setKeyAssumptions}
      />
    </div>
  );
}

/*
 * Success metrics — the UX-DR18 table's second consumer (AC 1): h3 header on
 * surface-container, 48px body rows, outline-variant bottom border, hover
 * overlay. Four text-input columns; the remove control sits beside the last
 * column's input (persona-form's cell grouping). The UX-DR18 empty state is
 * verbatim.
 */
function MetricsSection({
  metrics,
  setMetrics,
}: {
  metrics: BusinessCaseOutput["successMetrics"];
  setMetrics: (next: BusinessCaseOutput["successMetrics"]) => void;
}) {
  // Story 2.13: stable row keys (the 2-10 deferred index-key fix) — every
  // mutation below pairs its list update with the matching key op, so
  // surviving table rows keep their DOM identity (focus and edits intact).
  const rowKeys = useStableRowKeys(metrics.length);

  const addMetric = useCallback(
    () => {
      rowKeys.add();
      setMetrics([
        ...metrics,
        { name: "", definition: "", baseline: "", target: "" },
      ]);
    },
    [metrics, rowKeys, setMetrics],
  );

  const updateMetric = useCallback(
    (index: number, key: keyof BusinessCaseOutput["successMetrics"][number], value: string) => {
      const next = [...metrics];
      next[index] = { ...metrics[index], [key]: value };
      setMetrics(next);
    },
    [metrics, setMetrics],
  );

  // Story 2.13: the visible h3 labels its section programmatically (the
  // form-structure labeling sweep).
  const sectionId = useId();
  return (
    <section aria-labelledby={sectionId}>
      <h3 id={sectionId} className="text-label text-on-surface">
        Success metrics
      </h3>
      {metrics.length === 0 ? (
        // UX-DR18 empty state, verbatim (DESIGN.md Tables spec).
        <div className="mt-3 rounded-lg border border-outline-variant p-6">
          <p className="text-display-sm text-on-surface">No entries yet</p>
          <p className="mt-1 text-body text-on-surface-variant">
            Click &lsquo;Add&rsquo; to create your first entry.
          </p>
          <Button type="button" className="mt-4" onClick={addMetric}>
            Add metric
          </Button>
        </div>
      ) : (
        <>
          <Table className="mt-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {METRIC_COLUMNS.map((column) => (
                  <TableHead key={column} className="w-1/4">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric, index) => (
                <TableRow key={rowKeys.keys[index]}>
                  {METRIC_COLUMNS.map((column, columnIndex) => {
                    const fieldKey = (
                      ["name", "definition", "baseline", "target"] as const
                    )[columnIndex];
                    return (
                      <TableCell key={column}>
                        <div className="flex items-start gap-2">
                          <input
                            type="text"
                            autoComplete="off"
                            aria-label={`${column} for metric ${index + 1}`}
                            value={metric[fieldKey]}
                            onChange={(e) =>
                              updateMetric(index, fieldKey, e.target.value)
                            }
                            className={`${inputClasses} w-full`}
                          />
                          {columnIndex === METRIC_COLUMNS.length - 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Remove metric"
                              onClick={() => {
                                rowKeys.removeAt(index);
                                setMetrics(metrics.filter((_, i) => i !== index));
                              }}
                            >
                              <X aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={addMetric}
          >
            Add metric
          </Button>
        </>
      )}
    </section>
  );
}

/*
 * Key assumptions (AC 1, 2): a persona JobSection-style list (NO UX-DR18
 * empty-state card — DESIGN.md Phase 6 attaches no table spec to this
 * section). Each entry: assumption textarea + a row of three status chips
 * whose SELECTED chip carries the status color. Selected is derived, never
 * stored: assumption.status === status. Rows use the 2.13 stable-key hook
 * (the 2-7 deferred index-key fix, landed cross-form in this story).
 */
function AssumptionsSection({
  assumptions,
  setAssumptions,
}: {
  assumptions: BusinessCaseOutput["keyAssumptions"];
  setAssumptions: (next: BusinessCaseOutput["keyAssumptions"]) => void;
}) {
  // Story 2.13: stable row keys (the 2-10 deferred index-key fix) — every
  // mutation below pairs its list update with the matching key op.
  const rowKeys = useStableRowKeys(assumptions.length);

  const addAssumption = useCallback(
    // Schema default status ("Unknown") — never a hardcoded literal here.
    () => {
      rowKeys.add();
      setAssumptions([...assumptions, { text: "", status: "Unknown" }]);
    },
    [assumptions, rowKeys, setAssumptions],
  );

  const updateText = useCallback(
    (index: number, text: string) => {
      const next = [...assumptions];
      next[index] = { ...assumptions[index], text };
      setAssumptions(next);
    },
    [assumptions, setAssumptions],
  );

  const setStatus = useCallback(
    (index: number, status: AssumptionStatus) => {
      const next = [...assumptions];
      next[index] = { ...assumptions[index], status };
      setAssumptions(next);
    },
    [assumptions, setAssumptions],
  );

  // Story 2.13: the visible h3 labels its section programmatically.
  const sectionId = useId();
  return (
    <section aria-labelledby={sectionId} className="mt-8">
      <h3 id={sectionId} className="text-label text-on-surface">
        Key assumptions
      </h3>
      <div className="mt-3 flex flex-col gap-4">
        {assumptions.map((assumption, index) => (
          <div key={rowKeys.keys[index]} className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <textarea
                rows={1}
                aria-label={`Assumption ${index + 1}`}
                value={assumption.text}
                onChange={(e) => updateText(index, e.target.value)}
                className={assumptionTextareaClasses}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove assumption"
                onClick={() => {
                  rowKeys.removeAt(index);
                  setAssumptions(assumptions.filter((_, i) => i !== index));
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={`Status for assumption ${index + 1}`}>
              {ASSUMPTION_STATUSES.map((status) => {
                const selected = assumption.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStatus(index, status)}
                    className={`inline-flex h-7 items-center rounded-full px-3 text-body-sm transition-colors ${
                      selected
                        ? STATUS_SELECTED_CLASSES[status]
                        : STATUS_UNSELECTED_CLASSES
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={addAssumption}
      >
        Add assumption
      </Button>
    </section>
  );
}
