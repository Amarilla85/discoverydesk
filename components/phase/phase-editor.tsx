"use client";

import { PhaseType } from "@prisma/client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PersonaForm } from "@/components/phase/persona-form";
import { SaveIndicator } from "@/components/phase/save-indicator";
import { Toast } from "@/components/ui/toast";
import {
  draftKey,
  useAutoSave,
  useDraftValue,
} from "@/hooks/use-auto-save";
import { useCollaboration } from "@/hooks/use-collaboration";
import type { CollabSnapshot } from "@/lib/collab-types";

/*
 * Story 2.3 — the phase editor shell (AC 1–5): composes the auto-save engine
 * (hooks/use-auto-save.ts), the save indicator, the failure toast, and the
 * localStorage restore prompt around the editable surface.
 *
 * Story 2.4 adds the collaboration layer (NFR3, UX-DR27/UX-DR32): the editor
 * mounts `useCollaboration` and reacts to foreign edits via adoptServerValue
 * + the info toast. MOUNT-SITE BOUNDARY: this is the only polling host —
 * locked and In Review / Approved phases render no editor and are therefore
 * not polled; read-only-view polling (a Stakeholder watching an In Review
 * phase) arrives with Story 2.11's sign-off controls, its first consumer.
 *
 * SCAFFOLDING NOTE — the "Notes" textarea below is the deliberate 2.3
 * integration surface: it persists { notes: string } to Phase.output so every
 * auto-save AC is demonstrable end-to-end before the real forms exist.
 * Stories 2.5–2.10 replace THIS textarea with their per-phase forms + Zod
 * schemas (AD-11); the hooks, indicator, toasts, and restore prompt persist
 * unchanged — those stories map their form state onto setOutput({ … }).
 * Story 2.5 performed the first swap: Persona (Phase 1) renders PersonaForm
 * (lib/schemas/persona.ts is that form's single source of truth); the other
 * five phases keep the Notes scaffold until 2.6–2.10.
 *
 * In Review / Approved phases never render this component (the phase page
 * gates on Draft) — In Review is not editable per the EXPERIENCE.md phase
 * state machine, and the editor must not autosave into a locked-review phase.
 */
export function PhaseEditor({
  discoveryId,
  phaseType,
  initialOutput,
}: {
  discoveryId: string;
  phaseType: PhaseType;
  initialOutput: unknown;
}) {
  const { output, setOutput, status, restoreDraft, discardDraft, adoptServerValue } =
    useAutoSave({
      discoveryId,
      phaseType,
      initialOutput,
    });
  const draft = useDraftValue(draftKey(discoveryId, phaseType));

  const [hasEdited, setHasEdited] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [toastClosed, setToastClosed] = useState(false);

  // --- Story 2.4: polling integration (UX-DR27 / UX-DR32) ---------------
  // Per-phase last-seen updatedAt, seeded from the poll's cycle-0 baseline
  // snapshot (the editor receives no updatedAt prop today). A ref — read and
  // written inside the poll's async continuation, never during render.
  const seenUpdatedAtRef = useRef<Map<PhaseType, string> | null>(null);
  // Monotonic id per toast: the <Toast> below keys on it so a toast arriving
  // while the previous one plays its exit animation remounts fresh instead of
  // rendering inside the already-fading element (2.4 review finding).
  const pollToastSeqRef = useRef(0);
  const [pollToast, setPollToast] = useState<{
    id: number;
    name: string;
    conflict: boolean;
  } | null>(null);
  const [pollToastClosed, setPollToastClosed] = useState(false);
  // Story 2.5 (Task 5.2): bumped whenever adoptServerValue adopts a server
  // value — PersonaForm is remounted via key={adoptVersion} so RHF re-seeds
  // its defaultValues from the adopted output (RHF cannot re-seed from a
  // prop change). Safe: adoption only happens when the form is NOT dirty.
  const [adoptVersion, setAdoptVersion] = useState(0);

  // Runs inside the poll's async continuation (event context — the lint-safe
  // place for these state updates).
  const handleCollabSnapshot = useCallback(
    (snapshot: CollabSnapshot) => {
      const seen = seenUpdatedAtRef.current;
      if (seen === null) {
        // Cycle-0 baseline: record, never toast — there is nothing to diff
        // against yet (the snapshot still refreshes server-rendered content).
        seenUpdatedAtRef.current = new Map(
          snapshot.phases.map((p) => [p.phaseType, p.updatedAt]),
        );
        return;
      }

      const row = snapshot.phases.find((p) => p.phaseType === phaseType);
      const previous = seen.get(phaseType);
      const phaseChanged =
        row !== undefined &&
        previous !== undefined &&
        row.updatedAt > previous;

      // Track every phase (stepper-only changes too) so later diffs stay correct.
      const next = new Map(seen);
      for (const p of snapshot.phases) {
        const known = next.get(p.phaseType);
        if (known === undefined || p.updatedAt > known) {
          next.set(p.phaseType, p.updatedAt);
        }
      }
      seenUpdatedAtRef.current = next;

      if (!phaseChanged || row === undefined) return;
      // UX-DR32: adopt server values unless this phase has unsaved local
      // input — adoptServerValue no-ops then and reports it. The draft IS the
      // rendered textarea value here, so "preserved in a draft buffer,
      // re-applied after the refresh" (UX-DR32) is continuous: the visible
      // value never flickers, and the buffer persists until a save succeeds.
      const adopted = adoptServerValue(row.output);
      // Story 2.5: a successful adoption re-seeds the Persona form by
      // remounting it with the server output (state update is lint-safe here —
      // poll continuation). A refused adoption (draft exists) remounts nothing.
      // So does an adoption of OUR OWN write (updatedBySelf): the server value
      // is then identical to local state (any local edit would have left a
      // draft, making adoptServerValue refuse), so remounting would only drop
      // keyboard focus from the field the user is on (2.5 review finding).
      if (adopted && !row.updatedBySelf) setAdoptVersion((v) => v + 1);
      // Toast attribution rules (story 2.6): silent refresh when the writer
      // is unnamed (no record) or is this user (their other tab).
      if (!row.updatedByName || row.updatedBySelf) return;
      pollToastSeqRef.current += 1;
      setPollToast({
        id: pollToastSeqRef.current,
        name: row.updatedByName,
        conflict: !adopted,
      });
      setPollToastClosed(false); // a newly arriving toast re-arms after a prior dismiss
    },
    [adoptServerValue, phaseType],
  );

  useCollaboration(discoveryId, { onSnapshot: handleCollabSnapshot });

  const closePollToast = useCallback(() => setPollToastClosed(true), []);

  // Render-time adjustment (create-discovery-form's guarded pattern): re-arm
  // the toast if the gave-up state is re-entered after a later edit cycle.
  if (status.kind !== "gave-up" && toastClosed) {
    setToastClosed(false);
  }
  const closeToast = useCallback(() => setToastClosed(true), []);

  const initialJson = JSON.stringify(initialOutput ?? {});
  // Banner only for a mount-time draft the server does not have (AC 4, UX-DR33).
  // Once the user edits this session, the indicator owns the failure story.
  const showBanner =
    !bannerDismissed && !hasEdited && draft !== null && draft !== initialJson;

  return (
    <div>
      {showBanner ? (
        <div className="mb-4 rounded-lg border border-outline-variant bg-surface-container p-4">
          <p className="text-body text-on-surface">
            You have unsaved changes. Restore them?
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                restoreDraft();
                setHasEdited(true);
                setBannerDismissed(true);
              }}
            >
              Restore
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                discardDraft();
                setBannerDismissed(true);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {phaseType === PhaseType.Persona ? (
        // Story 2.5: the real Phase 1 form (FR-7). key={adoptVersion} re-seeds
        // RHF when a poll adopts server values (Task 5.2); key={phaseType} on
        // the editor mount above already isolates per-phase state.
        <PersonaForm
          key={adoptVersion}
          output={output}
          onOutputChange={(next) => {
            setHasEdited(true);
            setOutput(next);
          }}
        />
      ) : (
        <form onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="phase-notes" className="text-label text-on-surface">
            Notes
          </label>
          <textarea
            id="phase-notes"
            value={extractNotes(output)}
            onChange={(e) => {
              setHasEdited(true);
              setOutput({ notes: e.target.value });
            }}
            className="mt-2 min-h-20 w-full rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled"
          />
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Draft notes for this phase. Saved automatically.
          </p>
        </form>
      )}

      {status.kind === "terminal" ? (
        <p role="alert" className="mt-3 text-body-sm text-destructive">
          {status.message}
          {status.code === "auth_required" ? (
            <>
              {" "}
              <Link
                href="/auth/signin"
                className="text-primary underline underline-offset-2"
              >
                Go to sign in
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {status.kind === "gave-up" && !toastClosed ? (
        <Toast onDismiss={closeToast}>
          Couldn&apos;t save. Please check your connection.
        </Toast>
      ) : null}

      {/* Story 2.4 (UX-DR27 / UX-DR32): polling-update toast. Info variant,
          2s dismiss, polite live region (Toast defaults by variant). The save
          -failure toast can coexist — both render bottom-right; overlapping
          is a known cosmetic edge until 2.11 brings stacked toasts. */}
      {pollToast !== null && !pollToastClosed ? (
        <Toast key={pollToast.id} variant="info" onDismiss={closePollToast}>
          {pollToast.conflict
            ? `Updated by ${pollToast.name}. Your local changes have been preserved.`
            : `Updated by ${pollToast.name}.`}
        </Toast>
      ) : null}

      <SaveIndicator status={status} />
    </div>
  );
}

function extractNotes(output: unknown): string {
  if (typeof output === "object" && output !== null && "notes" in output) {
    const value = (output as { notes: unknown }).notes;
    return typeof value === "string" ? value : "";
  }
  return "";
}
