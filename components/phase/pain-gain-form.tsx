"use client";

import { useCallback, useId, useRef } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { ChevronDown, ChevronUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useStableRowKeys } from "@/hooks/use-stable-row-keys";
import {
  normalizePainGainOutput,
  painCombinedScore,
  type GainEntry,
  type PainEntry,
  type PainGainOutput,
} from "@/lib/schemas/pain-gain";

/*
 * Story 2.6 — the Pain/Gain Mapping (Phase 2) form (FR-8, ACs 1–5). Replaces
 * the 2.3 scaffolding Notes surface for PainGain only (phase-editor.tsx swaps
 * on phaseType); ValueProp–BusinessCase keep the scaffold until 2.7–2.10.
 *
 * State contract with hooks/use-auto-save.ts — the 2.5 PersonaForm pattern:
 * - RHF owns field state; useAutoSave owns persistence. Seeding happens once
 *   at mount from `output` via normalizePainGainOutput (legacy `{ notes }`
 *   output from 2.3 renders as an empty form). The `output` prop never
 *   re-seeds RHF afterwards: a server adoption arrives via a keyed remount
 *   (phase-editor.tsx's adoptVersion counter).
 * - The form is fully CONTROLLED through one funnel: every edit calls
 *   setField(key, value), which writes RHF state (setValue, event context —
 *   lint-safe) and pushes the complete next value to onOutputChange (the
 *   editor's setOutput → the 500ms debounced save). No RHF watch() render
 *   callback: that watch() API is flagged incompatible with React Compiler
 *   (react-hooks/incompatible-library). State is read through useWatch (the
 *   compiler-compatible subscription hook) instead.
 * - A serialized dedupe in push prevents resets/remounts from scheduling
 *   phantom saves.
 * - pains/gains are managed as controlled arrays through the same setField
 *   funnel — the exact mechanism persona-form.tsx shipped for its
 *   object-array outcomes. RHF's useFieldArray could manage them too (object
 *   arrays, unlike 2.5's string[] job lists), but every mutation here already
 *   flows through the funnel's setValue, so the hook's internal array state
 *   would be a second, redundant owner of the same data.
 * - Form state is schema-valid by construction (permissive schema, slider
 *   snap, fully defaulted appends); the server-side validation_error backstop
 *   in actions/phases.ts is never reachable from form-driven saves.
 */

// UX-DR10 textarea at 40px height — the phase-specific precedent persona-form
// set (phase-specific spec wins over UX-DR10's 80px generic).
const descriptionTextareaClasses =
  "h-10 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled";

// UX-DR18 empty state (verbatim copy per DESIGN.md's Tables spec).
const emptyStateCard = "rounded-lg border border-outline-variant p-6";

// painCombinedScore's range (severity + frequency + impact, each 1-5). The
// UX-DR31 spec defines no opacity stops; the bar mapping (higher = darker)
// is the story's documented decision: 0.35 at the score floor → 1.0 at the
// ceiling, linear in between.
const PAIN_SCORE_MIN = 3;
const PAIN_SCORE_MAX = 15;

export function PainGainForm({
  output,
  onOutputChange,
}: {
  output: unknown;
  onOutputChange: (next: PainGainOutput) => void;
}) {
  const { control, setValue } = useForm<PainGainOutput>({
    defaultValues: normalizePainGainOutput(output),
  });
  // Render-scope view of the form state (re-seeds only on remount — the
  // output prop is intentionally not re-synced into RHF, see header). The
  // combined scores and the ranking derive from this view.
  const watched = useWatch({ control });
  const current = normalizePainGainOutput(watched);

  const lastPushedRef = useRef<string | null>(null);
  const push = useCallback(
    (next: PainGainOutput) => {
      const json = JSON.stringify(next);
      if (json === lastPushedRef.current) return;
      lastPushedRef.current = json;
      onOutputChange(next);
    },
    [onOutputChange],
  );

  const setField = useCallback(
    <K extends keyof PainGainOutput>(key: K, value: PainGainOutput[K]) => {
      setValue(key as Path<PainGainOutput>, value, { shouldDirty: true });
      push({ ...current, [key]: value });
    },
    [current, push, setValue],
  );

  return (
    // AC 1: two columns — Pains left, Gains right. Below lg the grid
    // collapses to a single column (story decision: no narrow-viewport
    // stacking rule exists in DESIGN.md).
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <PainsColumn
        pains={current.pains}
        setPains={(next) => setField("pains", next)}
      />
      <GainsColumn
        gains={current.gains}
        setGains={(next) => setField("gains", next)}
      />
      {/* AC 4: the UX-DR31 ranking spans both columns, below them. */}
      <div className="lg:col-span-2">
        <PainRanking pains={current.pains} />
      </div>
    </div>
  );
}

/*
 * Shared entry-card controls (AC 5): reorder within the column (chevrons,
 * disabled at the ends) and immediate delete (no confirmation — 2.5's
 * precedent for entry removal). Icon-only controls carry labels (2.13's
 * floor, shipped in 2.5).
 */
function EntryControls({
  entryLabel,
  index,
  count,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  entryLabel: string;
  index: number;
  count: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Move ${entryLabel} up`}
        disabled={index === 0}
        onClick={onMoveUp}
      >
        <ChevronUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Move ${entryLabel} down`}
        disabled={index === count - 1}
        onClick={onMoveDown}
      >
        <ChevronDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${entryLabel}`}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/*
 * One labeled slider row (AC 2/3): the visible `text-label` above the
 * UX-DR23 slider (integer snap 1-5, value next to thumb, hover tooltip — all
 * in components/ui/slider.tsx, reused phase-agnostically). Story 2.13: the
 * label is a real <label htmlFor> linked to the input via the Slider's id
 * prop (the 2-6 deferred label-linkage item) — previously a <span> that
 * screen readers did not announce as the input's label.
 */
function ScoredSlider({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-label text-on-surface">
        {label}
      </label>
      <Slider
        id={id}
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        className="mt-1 w-full"
      />
    </div>
  );
}

/*
 * Left column (AC 1): pain entries — description, three 1-5 sliders
 * (severity, frequency, business impact), and the auto-calculated combined
 * score displayed per entry in `code` type with tabular-nums.
 */
function PainsColumn({
  pains,
  setPains,
}: {
  pains: PainEntry[];
  setPains: (next: PainEntry[]) => void;
}) {
  // Story 2.13: stable row keys (the 2-7/2-10 deferred index-key fix) —
  // every mutation below pairs its list update with the matching key op,
  // so surviving cards keep their DOM identity (focus and sliders intact).
  const rowKeys = useStableRowKeys(pains.length);

  const addPain = useCallback(
    () => {
      rowKeys.add();
      setPains([
        ...pains,
        { description: "", severity: 3, frequency: 3, businessImpact: 3 },
      ]);
    },
    [pains, rowKeys, setPains],
  );

  // AC 5 reorder: array mutation through the funnel (the schema's ordering
  // is array index; nothing score- or order-shaped is stored separately).
  const movePain = useCallback(
    (from: number, to: number) => {
      const next = [...pains];
      const [entry] = next.splice(from, 1);
      next.splice(to, 0, entry);
      setPains(next);
    },
    [pains, setPains],
  );

  const updatePain = useCallback(
    (index: number, next: PainEntry) => {
      const copy = [...pains];
      copy[index] = next;
      setPains(copy);
    },
    [pains, setPains],
  );

  // Story 2.13: the visible h3 labels its section programmatically (the
  // form-structure labeling sweep).
  const sectionId = useId();
  return (
    <section aria-labelledby={sectionId}>
      <h3 id={sectionId} className="text-h3 text-on-surface">
        Pains
      </h3>
      {pains.length === 0 ? (
        <div className={`${emptyStateCard} mt-3`}>
          <p className="text-display-sm text-on-surface">No entries yet</p>
          <p className="mt-1 text-body text-on-surface-variant">
            Click &lsquo;Add&rsquo; to create your first entry.
          </p>
          <Button type="button" className="mt-4" onClick={addPain}>
            Add pain
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {pains.map((pain, index) => (
            <PainEntryCard
              key={rowKeys.keys[index]}
              index={index}
              count={pains.length}
              pain={pain}
              onChange={(next) => updatePain(index, next)}
              onRemove={() => {
                rowKeys.removeAt(index);
                setPains(pains.filter((_, i) => i !== index));
              }}
              onMoveUp={() => {
                rowKeys.swap(index, index - 1);
                movePain(index, index - 1);
              }}
              onMoveDown={() => {
                rowKeys.swap(index, index + 1);
                movePain(index, index + 1);
              }}
            />
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addPain}>
            Add pain
          </Button>
        </div>
      )}
    </section>
  );
}

function PainEntryCard({
  index,
  count,
  pain,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  count: number;
  pain: PainEntry;
  onChange: (next: PainEntry) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    // Entry card: rounded.lg, outline-variant border (DESIGN.md card tokens;
    // cards sit flat — elevation never indicates state).
    <div className="rounded-lg border border-outline-variant bg-surface p-4">
      <div className="flex items-start gap-2">
        <textarea
          rows={1}
          aria-label={`Pain ${index + 1} description`}
          placeholder="Describe the pain"
          value={pain.description}
          onChange={(e) => onChange({ ...pain, description: e.target.value })}
          className={descriptionTextareaClasses}
        />
        <EntryControls
          entryLabel="pain"
          index={index}
          count={count}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
        />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <ScoredSlider
          label="Severity"
          value={pain.severity}
          onChange={(severity) => onChange({ ...pain, severity })}
          ariaLabel={`Severity for pain ${index + 1}`}
        />
        <ScoredSlider
          label="Frequency"
          value={pain.frequency}
          onChange={(frequency) => onChange({ ...pain, frequency })}
          ariaLabel={`Frequency for pain ${index + 1}`}
        />
        <ScoredSlider
          label="Business impact"
          value={pain.businessImpact}
          onChange={(businessImpact) => onChange({ ...pain, businessImpact })}
          ariaLabel={`Business impact for pain ${index + 1}`}
        />
      </div>
      {/* AC 2: combined score, live-derived (never stored) — `code` type +
          tabular-nums per DESIGN.md's numeric-display rule. */}
      <p className="mt-3 text-code font-mono tabular-nums text-on-surface">
        Combined score: {painCombinedScore(pain)}
      </p>
    </div>
  );
}

/*
 * Right column (AC 1): gain entries — description and two 1-5 sliders
 * (relevance, current satisfaction). No combined score: FR-8 defines one
 * for pains only.
 */
function GainsColumn({
  gains,
  setGains,
}: {
  gains: GainEntry[];
  setGains: (next: GainEntry[]) => void;
}) {
  // Story 2.13: stable row keys (see PainsColumn) — every mutation below
  // pairs its list update with the matching key op.
  const rowKeys = useStableRowKeys(gains.length);

  const addGain = useCallback(
    () => {
      rowKeys.add();
      setGains([...gains, { description: "", relevance: 3, currentSatisfaction: 3 }]);
    },
    [gains, rowKeys, setGains],
  );

  const moveGain = useCallback(
    (from: number, to: number) => {
      const next = [...gains];
      const [entry] = next.splice(from, 1);
      next.splice(to, 0, entry);
      setGains(next);
    },
    [gains, setGains],
  );

  const updateGain = useCallback(
    (index: number, next: GainEntry) => {
      const copy = [...gains];
      copy[index] = next;
      setGains(copy);
    },
    [gains, setGains],
  );

  // Story 2.13: the visible h3 labels its section programmatically.
  const sectionId = useId();
  return (
    <section aria-labelledby={sectionId}>
      <h3 id={sectionId} className="text-h3 text-on-surface">
        Gains
      </h3>
      {gains.length === 0 ? (
        <div className={`${emptyStateCard} mt-3`}>
          <p className="text-display-sm text-on-surface">No entries yet</p>
          <p className="mt-1 text-body text-on-surface-variant">
            Click &lsquo;Add&rsquo; to create your first entry.
          </p>
          <Button type="button" className="mt-4" onClick={addGain}>
            Add gain
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {gains.map((gain, index) => (
            <GainEntryCard
              key={rowKeys.keys[index]}
              index={index}
              count={gains.length}
              gain={gain}
              onChange={(next) => updateGain(index, next)}
              onRemove={() => {
                rowKeys.removeAt(index);
                setGains(gains.filter((_, i) => i !== index));
              }}
              onMoveUp={() => {
                rowKeys.swap(index, index - 1);
                moveGain(index, index - 1);
              }}
              onMoveDown={() => {
                rowKeys.swap(index, index + 1);
                moveGain(index, index + 1);
              }}
            />
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addGain}>
            Add gain
          </Button>
        </div>
      )}
    </section>
  );
}

function GainEntryCard({
  index,
  count,
  gain,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  count: number;
  gain: GainEntry;
  onChange: (next: GainEntry) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface p-4">
      <div className="flex items-start gap-2">
        <textarea
          rows={1}
          aria-label={`Gain ${index + 1} description`}
          placeholder="Describe the gain"
          value={gain.description}
          onChange={(e) => onChange({ ...gain, description: e.target.value })}
          className={descriptionTextareaClasses}
        />
        <EntryControls
          entryLabel="gain"
          index={index}
          count={count}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
        />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <ScoredSlider
          label="Relevance"
          value={gain.relevance}
          onChange={(relevance) => onChange({ ...gain, relevance })}
          ariaLabel={`Relevance for gain ${index + 1}`}
        />
        <ScoredSlider
          label="Current satisfaction"
          value={gain.currentSatisfaction}
          onChange={(currentSatisfaction) =>
            onChange({ ...gain, currentSatisfaction })
          }
          ariaLabel={`Current satisfaction for gain ${index + 1}`}
        />
      </div>
    </div>
  );
}

/*
 * AC 4 — the UX-DR31 Pain Ranking: pains sorted by combined score descending
 * (stable tie-break on entry order), rendered as horizontal bars on a
 * surface-container card with spacing.6 padding. Bar width is score/15;
 * fill is primary at the story's documented opacity mapping (higher score =
 * darker). Display-only: each row's description and score are plain text, so
 * screen readers read them without extra semantics. The ranking is DERIVED —
 * deleting an entry removes it here automatically (FR-8 consequence).
 */
function PainRanking({ pains }: { pains: PainEntry[] }) {
  // Story 2.13: the visible h3 labels its section programmatically.
  // (Declared before the empty-state early return — Rules of Hooks.)
  const sectionId = useId();
  if (pains.length === 0) return null;
  const ranked = pains
    .map((pain, index) => ({ pain, index, score: painCombinedScore(pain) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return (
    <section aria-labelledby={sectionId} className="rounded-lg bg-surface-container p-6">
      <h3 id={sectionId} className="text-h3 text-on-surface">
        Pain ranking
      </h3>
      <div className="mt-3 flex flex-col gap-3">
        {/* key stays the ORIGINAL array index (stable identity across
            re-sorts); the fallback label uses the RANKED position — labeling
            by the pre-sort index read as "Pain 5" on the top row. */}
        {ranked.map(({ pain, index, score }, rank) => (
          <div key={index} className="flex items-center gap-3">
            <span className="w-48 shrink-0 truncate text-body-sm text-on-surface">
              {pain.description || `Pain ${rank + 1}`}
            </span>
            <div className="h-4 min-w-0 flex-1">
              <div
                className="h-4 rounded-sm bg-primary"
                style={{
                  width: `${(score / PAIN_SCORE_MAX) * 100}%`,
                  opacity:
                    0.35 +
                    0.65 * ((score - PAIN_SCORE_MIN) / (PAIN_SCORE_MAX - PAIN_SCORE_MIN)),
                }}
              />
            </div>
            <span className="w-8 text-right text-code font-mono tabular-nums text-on-surface">
              {score}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
