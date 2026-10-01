"use client";

import { useCallback, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  normalizeValuePropOutput,
  unresolvedProfileItems,
  type ValuePropOutput,
} from "@/lib/schemas/value-prop";

/*
 * Story 2.7 — the Value Proposition Canvas (Phase 3) form (FR-9, ACs 1–4).
 * Third real phase form: replaces the 2.3 scaffolding Notes surface for
 * ValueProp only (phase-editor.tsx swaps on phaseType).
 *
 * State contract with hooks/use-auto-save.ts (story 2.5/2.6 Dev Notes):
 * - RHF owns field state; useAutoSave owns persistence. Seeding happens once
 *   at mount from `output` via normalizeValuePropOutput — where `output` is
 *   ALREADY the page-composed pre-population seed when the phase is fresh
 *   (story Task 3: seedValuePropFromPrior runs server-side and arrives as the
 *   ordinary initialOutput). The `output` prop never re-seeds RHF afterwards:
 *   a server adoption arrives via a keyed remount (phase-editor.tsx).
 * - The form is fully CONTROLLED through one funnel: every edit calls
 *   setCustomerProfile/setValueMap, which writes RHF state (setValue, event
 *   context — lint-safe) and pushes the complete next value to
 *   onOutputChange (the editor's setOutput → the 500ms debounced save). No
 *   RHF watch() render callback (react-hooks/incompatible-library) — state is
 *   read through useWatch, and a serialized dedupe in push prevents
 *   resets/remounts from scheduling phantom saves. All six lists are
 *   string[] managed as controlled rows (the shipped 2-5/2-6 funnel — NOT
 *   useFieldArray; 2-6's documented single-owner-of-data decision).
 * - The FR-9 gap check (unresolvedProfileItems) derives from the SAME watch
 *   state, so "Unresolved" flags clear on keystroke (AC 4) — before any
 *   save. Flags are computed, never stored (2.6's painCombinedScore
 *   principle), and never block saving: FR-9 defines no completeness gate.
 */

// UX-DR10 inputs: 40px height, rounded-sm, outline border, surface fill
// (persona-form's phase-specific textarea precedent).
const itemTextareaClasses =
  "h-10 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";

// FR-7's inline-guidance requirement is persona-specific (2-6 precedent);
// Phase 3 has no guidance copy in the spec. Section labels only (UX-DR25).
type ProfileListKey = "gains" | "pains" | "jobs";
type MapListKey = "gainCreators" | "painRelievers" | "productsAndServices";

const PROFILE_SECTIONS: Array<{
  key: ProfileListKey;
  label: string;
  addLabel: string;
  removeLabel: string;
}> = [
  { key: "gains", label: "Gains", addLabel: "Add gain", removeLabel: "Remove gain" },
  { key: "pains", label: "Pains", addLabel: "Add pain", removeLabel: "Remove pain" },
  { key: "jobs", label: "Jobs", addLabel: "Add job", removeLabel: "Remove job" },
];

const MAP_SECTIONS: Array<{
  key: MapListKey;
  label: string;
  addLabel: string;
  removeLabel: string;
}> = [
  { key: "gainCreators", label: "Gain creators", addLabel: "Add gain creator", removeLabel: "Remove gain creator" },
  { key: "painRelievers", label: "Pain relievers", addLabel: "Add pain reliever", removeLabel: "Remove pain reliever" },
  { key: "productsAndServices", label: "Products and services", addLabel: "Add product or service", removeLabel: "Remove product or service" },
];

export function ValuePropForm({
  output,
  onOutputChange,
}: {
  output: unknown;
  onOutputChange: (next: ValuePropOutput) => void;
}) {
  const { control, setValue } = useForm<ValuePropOutput>({
    defaultValues: normalizeValuePropOutput(output),
  });
  // Render-scope view of the form state (re-seeds only on remount — the
  // output prop is intentionally not re-synced into RHF, see header). The
  // normalize guard mirrors persona-form's shipped pattern; the push dedupe
  // keeps any normalization artifacts from scheduling phantom saves.
  const watched = useWatch({ control });
  const current = normalizeValuePropOutput(watched);
  // FR-9 gap check — derived at render, never stored, never blocking save.
  const unresolved = unresolvedProfileItems(current);

  const lastPushedRef = useRef<string | null>(null);
  const push = useCallback(
    (next: ValuePropOutput) => {
      const json = JSON.stringify(next);
      if (json === lastPushedRef.current) return;
      lastPushedRef.current = json;
      onOutputChange(next);
    },
    [onOutputChange],
  );

  const setCustomerProfile = useCallback(
    (next: ValuePropOutput["customerProfile"]) => {
      setValue("customerProfile", next, { shouldDirty: true });
      push({ ...current, customerProfile: next });
    },
    [current, push, setValue],
  );

  const setValueMap = useCallback(
    (next: ValuePropOutput["valueMap"]) => {
      setValue("valueMap", next, { shouldDirty: true });
      push({ ...current, valueMap: next });
    },
    [current, push, setValue],
  );

  return (
    <div>
      {/* Two-zone canvas (DESIGN.md Phase 3 spec): Customer Profile left,
          Value Map right; single-column stack below lg (2-6's documented
          mobile decision carried forward). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h3 className="text-h3 text-on-surface">Customer Profile</h3>
          {PROFILE_SECTIONS.map((section) => (
            <ListSection
              key={section.key}
              label={section.label}
              addLabel={section.addLabel}
              removeLabel={section.removeLabel}
              items={current.customerProfile[section.key]}
              unresolvedFlags={unresolved[section.key]}
              setItems={(next) =>
                setCustomerProfile({
                  ...current.customerProfile,
                  [section.key]: next,
                })
              }
            />
          ))}
        </section>

        <section>
          <h3 className="text-h3 text-on-surface">Value Map</h3>
          {MAP_SECTIONS.map((section) => (
            <ListSection
              key={section.key}
              label={section.label}
              addLabel={section.addLabel}
              removeLabel={section.removeLabel}
              items={current.valueMap[section.key]}
              setItems={(next) =>
                setValueMap({ ...current.valueMap, [section.key]: next })
              }
            />
          ))}
        </section>
      </div>
    </div>
  );
}

/*
 * UX-DR30 gap indicator on a single Customer Profile item: 2px destructive
 * left border on the item row plus an "Unresolved" badge (badge-error
 * tokens). Badge anatomy mirrors discovery-state-badge.tsx (h-6, rounded-full,
 * px-2, caption/medium) — kept local to this form (story Task 2.6: the shared
 * badge primitive generalizes when sign-off badges land in 2.11/2.12).
 */
function UnresolvedBadge() {
  return (
    <span className="inline-flex h-6 items-center justify-center rounded-full bg-badge-error px-2 text-caption font-medium text-badge-error-text">
      Unresolved
    </span>
  );
}

/*
 * One editable list section (all six zones of the canvas share it): 40px
 * textarea rows + ghost X remove (persona-form's JobSection pattern),
 * UX-DR18 empty state when empty, and — for Customer Profile sections only —
 * the per-item gap flag. The row is a column: badge line (when flagged), then
 * textarea+remove line, so the 40px input height stays intact at both grid
 * widths.
 */
function ListSection({
  label,
  addLabel,
  removeLabel,
  items,
  setItems,
  unresolvedFlags,
}: {
  label: string;
  addLabel: string;
  removeLabel: string;
  items: string[];
  setItems: (next: string[]) => void;
  unresolvedFlags?: boolean[];
}) {
  const addItem = useCallback(
    () => setItems([...items, ""]),
    [items, setItems],
  );

  return (
    <section className="mt-6">
      <h4 className="text-label text-on-surface">{label}</h4>
      {items.length === 0 ? (
        // UX-DR18 empty state, verbatim (DESIGN.md Tables spec — 2-5/2-6
        // precedent for reuse across phase forms).
        <div className="mt-3 rounded-lg border border-outline-variant p-6">
          <p className="text-display-sm text-on-surface">No entries yet</p>
          <p className="mt-1 text-body text-on-surface-variant">
            Click &lsquo;Add&rsquo; to create your first entry.
          </p>
          <Button type="button" className="mt-4" onClick={addItem}>
            {addLabel}
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2">
            {items.map((item, index) => {
              const flagged = unresolvedFlags?.[index] === true;
              return (
                <div key={index} className="flex flex-col gap-1">
                  {flagged ? (
                    <div className="flex justify-end">
                      <UnresolvedBadge />
                    </div>
                  ) : null}
                  <div
                    className={
                      flagged
                        ? "flex items-start gap-2 border-l-2 border-destructive pl-2"
                        : "flex items-start gap-2"
                    }
                  >
                    <textarea
                      rows={1}
                      aria-label={`${label} ${index + 1}`}
                      value={item}
                      onChange={(e) => {
                        const next = [...items];
                        next[index] = e.target.value;
                        setItems(next);
                      }}
                      className={itemTextareaClasses}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={removeLabel}
                      onClick={() =>
                        setItems(items.filter((_, i) => i !== index))
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={addItem}
          >
            {addLabel}
          </Button>
        </>
      )}
    </section>
  );
}
