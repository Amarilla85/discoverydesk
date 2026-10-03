"use client";

import { useCallback, useId, useRef } from "react";

import { useStableRowKeys } from "@/hooks/use-stable-row-keys";
import { useForm, useWatch, type Path } from "react-hook-form";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  normalizePersonaOutput,
  type PersonaOutput,
} from "@/lib/schemas/persona";

/*
 * Story 2.5 — the Persona (Phase 1) form (FR-7, ACs 1–5). The first real
 * phase form: replaces the 2.3 scaffolding Notes surface for Persona only
 * (phase-editor.tsx swaps on phaseType); the other five phases keep the
 * scaffold until Stories 2.6–2.10.
 *
 * State contract with hooks/use-auto-save.ts (story 2.5 Dev Notes):
 * - RHF owns field state; useAutoSave owns persistence. Seeding happens once
 *   at mount from `output` via normalizePersonaOutput (legacy `{ notes }`
 *   output from 2.3 renders as an empty form — 2-3's "discarded wholesale"
 *   finding). The `output` prop never re-seeds RHF afterwards: a server
 *   adoption arrives via a keyed remount (phase-editor.tsx Task 5.2).
 * - The form is fully CONTROLLED through one funnel: every edit calls
 *   setField(key, value), which writes RHF state (setValue, event context —
 *   lint-safe) and pushes the complete next value to onOutputChange (the
 *   editor's setOutput → the 500ms debounced save). No RHF watch() render
 *   callback: that watch() API is flagged incompatible with React Compiler
 *   (react-hooks/incompatible-library). State is read through useWatch (the
 *   compiler-compatible subscription hook) instead, and every edit already
 *   flows through our handlers, so the funnel is equivalent and lint-clean.
 * - A serialized dedupe in push prevents resets/remounts from scheduling
 *   phantom saves.
 * - Form state is schema-valid by construction (permissive schema, slider
 *   snap); the server-side validation_error backstop in actions/phases.ts is
 *   never reachable from form-driven saves.
 */

// UX-DR10 inputs: 40px height, rounded-sm, outline border, surface fill.
const inputClasses =
  "h-10 rounded-sm border border-outline bg-surface px-3 text-body text-on-surface placeholder:text-on-surface-disabled";

const jobTextareaClasses =
  "h-10 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";

// FR-7 AC 3 guidance text: body-sm, on-surface-variant. Copy authored in the
// 2.5 story (EXPERIENCE.md has no persona microcopy) — UX-DR25 voice.
const guidanceClasses = "text-body-sm text-on-surface-variant";

const GUIDANCE = {
  customerName:
    "Who this persona is. A role or segment works, e.g. Branch manager at a regional office.",
  roleContext:
    "What this customer does day to day, and the situation they operate in.",
  functionalJobs: "What the customer is trying to get done. One job per entry.",
  emotionalJobs:
    "How the customer wants to feel while getting the job done. One job per entry.",
  socialJobs: "How the customer wants to be perceived by others. One job per entry.",
  outcomes:
    "Outcomes the customer expects, scored by how satisfied they are with each today. 1 is not satisfied, 5 is fully satisfied.",
} as const;

type JobListName = "functionalJobs" | "emotionalJobs" | "socialJobs";

const JOB_SECTIONS: Array<{ name: JobListName; label: string }> = [
  { name: "functionalJobs", label: "Functional jobs" },
  { name: "emotionalJobs", label: "Emotional jobs" },
  { name: "socialJobs", label: "Social jobs" },
];

export function PersonaForm({
  output,
  onOutputChange,
}: {
  output: unknown;
  onOutputChange: (next: PersonaOutput) => void;
}) {
  const { control, setValue } = useForm<PersonaOutput>({
    defaultValues: normalizePersonaOutput(output),
  });
  // Render-scope view of the form state (re-seeds only on remount — the
  // output prop is intentionally not re-synced into RHF, see header).
  const watched = useWatch({ control });
  const current = normalizePersonaOutput(watched);

  const lastPushedRef = useRef<string | null>(null);
  const push = useCallback(
    (next: PersonaOutput) => {
      const json = JSON.stringify(next);
      if (json === lastPushedRef.current) return;
      lastPushedRef.current = json;
      onOutputChange(next);
    },
    [onOutputChange],
  );

  const setField = useCallback(
    <K extends keyof PersonaOutput>(key: K, value: PersonaOutput[K]) => {
      setValue(key as Path<PersonaOutput>, value, { shouldDirty: true });
      push({ ...current, [key]: value });
    },
    [current, push, setValue],
  );

  return (
    <div>
      <section>
        <label
          htmlFor="persona-customer-name"
          className="text-label text-on-surface"
        >
          Customer name/identifier
        </label>
        <input
          id="persona-customer-name"
          type="text"
          autoComplete="off"
          value={current.customerName}
          onChange={(e) => setField("customerName", e.target.value)}
          className={`${inputClasses} mt-2 w-full`}
        />
        <p className={`${guidanceClasses} mt-2`}>{GUIDANCE.customerName}</p>
      </section>

      <section className="mt-6">
        <label
          htmlFor="persona-role-context"
          className="text-label text-on-surface"
        >
          Role and context
        </label>
        <input
          id="persona-role-context"
          type="text"
          autoComplete="off"
          value={current.roleContext}
          onChange={(e) => setField("roleContext", e.target.value)}
          className={`${inputClasses} mt-2 w-full`}
        />
        <p className={`${guidanceClasses} mt-2`}>{GUIDANCE.roleContext}</p>
      </section>

      {JOB_SECTIONS.map((section) => (
        <JobSection
          key={section.name}
          name={section.name}
          label={section.label}
          jobs={current[section.name]}
          setJobs={(next) => setField(section.name, next)}
        />
      ))}

      <OutcomesSection
        outcomes={current.outcomes}
        setOutcomes={(next) => setField("outcomes", next)}
      />
    </div>
  );
}

/*
 * One jobs-to-be-done list (functional, emotional, social): textarea rows at
 * 40px height (DESIGN.md's Persona section — the phase-specific spec wins
 * over UX-DR10's 80px generic), add/remove per the epics AC 1. String[] is
 * the schema's shape (AD-7/AD-11), so no useFieldArray — controlled rows off
 * the funnel above.
 */
function JobSection({
  name,
  label,
  jobs,
  setJobs,
}: {
  name: JobListName;
  label: string;
  jobs: string[];
  setJobs: (next: string[]) => void;
}) {
  // Story 2.13: the visible h3 labels its section programmatically (the
  // form-structure labeling sweep).
  const sectionId = useId();
  // Story 2.13: stable row keys (the 2-7/2-10 deferred index-key fix) —
  // mid-list delete keeps each surviving row's DOM node, so the textarea
  // below the deleted row never has its content swapped under the caret.
  // Every mutation below pairs its list update with the matching key op.
  const rowKeys = useStableRowKeys(jobs.length);
  return (
    <section aria-labelledby={sectionId} className="mt-6">
      <h3 id={sectionId} className="text-label text-on-surface">
        {label}
      </h3>
      <p className={`${guidanceClasses} mt-2`}>{GUIDANCE[name]}</p>
      <div className="mt-3 flex flex-col gap-2">
        {jobs.map((job, index) => (
          <div key={rowKeys.keys[index]} className="flex items-start gap-2">
            <textarea
              rows={1}
              aria-label={`${label} ${index + 1}`}
              value={job}
              onChange={(e) => {
                const next = [...jobs];
                next[index] = e.target.value;
                setJobs(next);
              }}
              className={jobTextareaClasses}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove job"
              onClick={() => {
                rowKeys.removeAt(index);
                setJobs(jobs.filter((_, i) => i !== index));
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => {
          rowKeys.add();
          setJobs([...jobs, ""]);
        }}
      >
        Add job
      </Button>
    </section>
  );
}

/*
 * Desired outcomes with satisfaction scores — the UX-DR18 table's first
 * consumer (AC 4): h3 header on surface-container, 48px body rows,
 * outline-variant bottom border, hover overlay. Score column right-aligned
 * per DESIGN.md's Tables spec. The UX-DR18 empty state is verbatim.
 */
function OutcomesSection({
  outcomes,
  setOutcomes,
}: {
  outcomes: PersonaOutput["outcomes"];
  setOutcomes: (next: PersonaOutput["outcomes"]) => void;
}) {
  // Story 2.13: the visible h3 labels its section programmatically.
  const sectionId = useId();
  // Story 2.13: stable row keys (the 2-7/2-10 deferred index-key fix) —
  // every mutation below pairs its list update with the matching key op.
  const rowKeys = useStableRowKeys(outcomes.length);

  const addOutcome = useCallback(() => {
    rowKeys.add();
    setOutcomes([...outcomes, { description: "", satisfaction: 3 }]);
  }, [outcomes, rowKeys, setOutcomes]);

  return (
    <section aria-labelledby={sectionId} className="mt-8">
      <h3 id={sectionId} className="text-label text-on-surface">
        Desired outcomes
      </h3>
      {outcomes.length === 0 ? (
        // UX-DR18 empty state, verbatim (DESIGN.md Tables spec).
        <div className="mt-3 rounded-lg border border-outline-variant p-6">
          <p className="text-display-sm text-on-surface">No entries yet</p>
          <p className="mt-1 text-body text-on-surface-variant">
            Click &lsquo;Add&rsquo; to create your first entry.
          </p>
          <Button type="button" className="mt-4" onClick={addOutcome}>
            Add outcome
          </Button>
        </div>
      ) : (
        <>
          <Table className="mt-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-2/3">Outcome</TableHead>
                <TableHead className="text-right">Satisfaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outcomes.map((outcome, index) => (
                <TableRow key={rowKeys.keys[index]}>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      <textarea
                        rows={1}
                        aria-label={`Outcome ${index + 1}`}
                        value={outcome.description}
                        onChange={(e) => {
                          const next = [...outcomes];
                          next[index] = { ...outcome, description: e.target.value };
                          setOutcomes(next);
                        }}
                        className={jobTextareaClasses}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove outcome"
                        onClick={() => {
                          rowKeys.removeAt(index);
                          setOutcomes(outcomes.filter((_, i) => i !== index));
                        }}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Slider
                      value={outcome.satisfaction}
                      onChange={(satisfaction) => {
                        const next = [...outcomes];
                        next[index] = { ...outcome, satisfaction };
                        setOutcomes(next);
                      }}
                      ariaLabel={`Satisfaction score for outcome ${index + 1}`}
                      className="ml-auto w-44"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={addOutcome}
          >
            Add outcome
          </Button>
        </>
      )}
      <p className={`${guidanceClasses} mt-3`}>{GUIDANCE.outcomes}</p>
    </section>
  );
}
