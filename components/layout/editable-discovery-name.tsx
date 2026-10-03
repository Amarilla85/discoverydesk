"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  renameDiscovery,
  type RenameDiscoveryState,
} from "@/actions/discoveries";

/*
 * Inline-editable Discovery name for the top-bar center slot (UX-DR6).
 * Story 2.14 wires the real Server Action: click (or Enter on the button)
 * swaps to an input; Enter/blur commits via renameDiscovery, Escape cancels.
 *
 * Permission (AC 5): rename is Owner or BA Collaborator only — the page
 * resolves the viewer's role server-side and passes `canRename`. A viewer
 * without the grant gets a plain, non-interactive <p> (never a button, never
 * edit mode).
 *
 * Empty/whitespace commits stay in edit mode with the inline error (AC 3).
 * The client-side string is the AC-verbatim copy; the shared schema's
 * "Name is required." (create form's copy since 1.4) still backs the server
 * envelope — both strings are spec'd per surface (story Open Question 1).
 *
 * No success toast: the name visibly updates in place when the RSC refresh
 * delivers the new prop (the prevName sync below), so nothing to announce.
 * `conflict` resets the draft to the server's current name (the envelope
 * carries it) — someone else renamed mid-edit.
 */
const NAME_REQUIRED_MESSAGE = "Discovery name is required.";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function EditableDiscoveryName({
  name,
  discoveryId,
  canRename,
}: {
  name: string;
  discoveryId: string;
  canRename: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  // Reset the draft when the name prop changes — adjusted during render
  // (React's documented alternative to a setState-in-effect sync). Skipped
  // while editing so an upstream rename (e.g. via Story 2.4 polling) never
  // clobbers in-progress typing.
  const [prevName, setPrevName] = useState(name);
  if (prevName !== name) {
    setPrevName(name);
    if (!editing) setDraft(name);
  }
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const renameAction = useCallback(
    async (
      _prevState: RenameDiscoveryState | null,
      formData: FormData,
    ): Promise<RenameDiscoveryState> => {
      let result: RenameDiscoveryState;
      try {
        result = await renameDiscovery(null, formData);
      } catch {
        result = {
          ok: false,
          error: { code: "network_error", message: GENERIC_ERROR_MESSAGE },
        };
      }
      if (result.ok) {
        // Exit edit mode; the flight response's revalidatePath delivers the
        // new name prop and the prevName sync adopts it.
        setEditing(false);
        setError(null);
      } else if (result.conflict && result.currentName) {
        // Renamed under us — adopt the server's current name, exit cleanly.
        setDraft(result.currentName);
        setEditing(false);
        setError(null);
      } else {
        // Validation, forbidden, server, network: stay in edit mode with the
        // message inline (NFR8 — never a raw throw to the user).
        setEditing(true);
        setError(result.error.message);
      }
      return result;
    },
    [],
  );

  // Sequential client dispatch (Next 16 server-actions guide) serializes
  // re-entrant dispatches; `pending` guards the blur re-commit below.
  const [, dispatch, pending] = useActionState(renameAction, null);

  function commit() {
    const next = draft.trim();
    if (!next) {
      // AC 3: empty or whitespace-only keeps the previous name (nothing was
      // sent) and stays in edit mode with the inline error.
      setError(NAME_REQUIRED_MESSAGE);
      return;
    }
    if (next === name) {
      // Nothing changed — exit without a request.
      setEditing(false);
      setError(null);
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("name", next);
    dispatch(formData);
  }

  function cancel() {
    setDraft(name);
    setError(null);
    setEditing(false);
  }

  if (!canRename) {
    // AC 5: Stakeholders see text, not a control.
    return <p className="truncate px-2 py-1 text-h1 text-on-surface">{name}</p>;
  }

  if (editing) {
    return (
      <div className="relative w-full max-w-md">
        <input
          ref={inputRef}
          value={draft}
          disabled={pending}
          aria-busy={pending}
          aria-invalid={error !== null}
          maxLength={100}
          aria-label="Discovery name"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            // Disabling the focused input fires blur — don't re-commit the
            // in-flight request (sequential dispatch would serialize it into
            // a pointless second round-trip).
            if (!pending) commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") cancel();
          }}
          className={`h-10 w-full rounded-sm border-2 bg-surface px-3 text-h1 text-on-surface ${
            error ? "border-destructive" : "border-primary"
          }`}
        />
        {error ? (
          <p
            role="alert"
            className="absolute left-0 top-full z-50 mt-1 whitespace-nowrap text-caption text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="truncate rounded-sm px-2 py-1 text-h1 text-on-surface hover:bg-hover-overlay"
    >
      {name}
      {/* Affordance hint for screen readers (code-review patch): the visible
          text alone announces the name with no hint it opens the editor —
          same sr-only pattern as the 2.13 phase stepper. */}
      <span className="sr-only"> (edit Discovery name)</span>
    </button>
  );
}
