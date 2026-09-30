"use client";

import type { PhaseType } from "@prisma/client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useActionState,
  useSyncExternalStore,
} from "react";
import { updatePhase, type PhaseActionState } from "@/actions/phases";

/*
 * Story 2.3 — the auto-save engine (FR6, NFR2, NFR8, UX-DR28/UX-DR33).
 *
 * The user never sees a Save button (EXPERIENCE.md): setOutput() schedules a
 * debounced save 500ms after the last change; failures retry on a 3s interval
 * up to 5 times, then surface a toast state and keep the draft in localStorage
 * so a reload can offer to restore it. Typed server errors that retrying
 * cannot fix (auth_required, phase_gate_blocked, …) stop the loop and surface
 * their user-facing message.
 *
 * Invocation goes through useActionState (NFR8, React 19) with a client-side
 * wrapper: dispatch is called programmatically (no <form>), and the wrapper
 * catch-converts a thrown server-action POST (offline, server unreachable)
 * into the same typed envelope the action returns. Next 16 runs client
 * dispatched actions sequentially (node_modules/next/dist/docs/01-app/
 * 02-guides/server-actions.md, "Sequential dispatch on the client"), so
 * debounced saves queue safely without a hand-rolled queue.
 *
 * Results are processed inside the wrapper's async continuation — event
 * context, never during render — which keeps the react-hooks/set-state-in-effect
 * and refs lint traps out of this file (2.1's recurring lesson).
 *
 * The hook API is output-JSON-shaped (not notes-shaped) on purpose: Stories
 * 2.5–2.10 map their real forms onto exactly this surface and replace the
 * scaffolding editor that currently consumes it.
 */

const DEBOUNCE_MS = 500; // NFR2
const RETRY_INTERVAL_MS = 3000; // UX-DR28
const MAX_RETRIES = 5; // retries after the initial attempt; the 5th failed retry exhausts the budget

// Typed errors where retrying cannot help — stop immediately (UX-DR25 voice
// messages come straight from the action envelope).
const TERMINAL_CODES = new Set([
  "auth_required",
  "phase_gate_blocked",
  "not_found",
  "validation_error",
]);

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saved"; at: number }
  | { kind: "retrying" }
  | { kind: "gave-up" }
  | { kind: "terminal"; code: string; message: string };

/* ------------------------------------------------------------------ */
/* localStorage draft buffer (UX-DR33)                                 */
/* ------------------------------------------------------------------ */

const DRAFT_PREFIX = "dd:draft:";
// Story 2.4 consumes this event as the typing signal for polling pause —
// import the constant, never re-declare the string. The CustomEvent detail
// distinguishes writes (keystrokes — pause polling) from clears (save success
// or discard — NOT keystrokes, so they must not delay the poll resume clock).
export const DRAFT_EVENT = "dd:draft-change";

export function draftKey(discoveryId: string, phaseType: PhaseType): string {
  return `${DRAFT_PREFIX}${discoveryId}:${phaseType}`;
}

function writeDraft(key: string, json: string): void {
  try {
    localStorage.setItem(key, json);
    window.dispatchEvent(
      new CustomEvent(DRAFT_EVENT, { detail: { kind: "write" } }),
    );
  } catch {
    // Quota exceeded / private mode — the save attempt still proceeds; the
    // draft buffer is a safety net, not a requirement for saving.
  }
}

// Reads get the same tolerance as writes: browsers configured to block
// storage throw SecurityError on the localStorage property access itself,
// which must never crash the render (getSnapshot) or the save success path.
function readDraft(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
    window.dispatchEvent(
      new CustomEvent(DRAFT_EVENT, { detail: { kind: "clear" } }),
    );
  } catch {
    // Same tolerance as writeDraft.
  }
}

/*
 * Post-hydration draft snapshot for the restore prompt (UX-DR33). The server
 * snapshot is always null, so SSR/hydration render no banner and the client
 * snapshot takes over after hydration — no hydration mismatch, no
 * setState-in-effect. Strings compare by value, so the snapshot is stable
 * between renders while the draft is unchanged.
 */
function subscribeDraft(onChange: () => void): () => void {
  window.addEventListener(DRAFT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DRAFT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useDraftValue(key: string): string | null {
  return useSyncExternalStore(
    subscribeDraft,
    () => readDraft(key),
    () => null,
  );
}

/* ------------------------------------------------------------------ */
/* The hook                                                            */
/* ------------------------------------------------------------------ */

export function useAutoSave({
  discoveryId,
  phaseType,
  initialOutput,
}: {
  discoveryId: string;
  phaseType: PhaseType;
  initialOutput: unknown;
}) {
  const key = draftKey(discoveryId, phaseType);
  const [output, setOutputState] = useState<unknown>(initialOutput);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  // Payload JSON of the most recently dispatched save — the retry loop
  // re-sends exactly what failed, and success clears the draft only when it
  // still matches (newer edits keep their draft).
  const inflightRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const handleResult = useCallback(
    (result: PhaseActionState) => {
      const payload = inflightRef.current;
      if (result.ok) {
        retryCountRef.current = 0;
        if (payload !== null && readDraft(key) === payload) {
          clearDraft(key); // server now has everything the draft had
        }
        setStatus({ kind: "saved", at: Date.now() });
        return;
      }
      if (TERMINAL_CODES.has(result.error.code)) {
        setStatus({
          kind: "terminal",
          code: result.error.code,
          message: result.error.message,
        });
        return;
      }
      // server_error / network_error / unknown — retryable.
      retryCountRef.current += 1;
      setStatus(
        retryCountRef.current > MAX_RETRIES
          ? { kind: "gave-up" }
          : { kind: "retrying" },
      );
    },
    [key],
  );

  // Client-side wrapper around the Server Action (AC 6, NFR8): a network
  // failure throws instead of returning the envelope, so convert it here —
  // the raw exception must never reach the UI.
  const saveAction = useCallback(
    async (
      _prevState: PhaseActionState | null,
      formData: FormData,
    ): Promise<PhaseActionState> => {
      let result: PhaseActionState;
      try {
        result = await updatePhase(null, formData);
      } catch {
        result = {
          ok: false,
          error: {
            code: "network_error",
            message: "Couldn't save. Please check your connection.",
          },
        };
      }
      handleResult(result);
      return result;
    },
    [handleResult],
  );

  const [, dispatch] = useActionState(saveAction, null);

  const startSave = useCallback(
    (json: string) => {
      inflightRef.current = json;
      const formData = new FormData();
      formData.set("discoveryId", discoveryId);
      formData.set("phaseType", phaseType);
      formData.set("output", json);
      dispatch(formData);
    },
    [discoveryId, phaseType, dispatch],
  );

  // Retry loop: while the status is "retrying", re-send the failed payload
  // every 3s. setState/dispatch happen inside the timeout callback (event
  // context), not the effect body.
  useEffect(() => {
    if (status.kind !== "retrying") return;
    const id = window.setTimeout(() => {
      if (inflightRef.current !== null) startSave(inflightRef.current);
    }, RETRY_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [status, startSave]);

  // Stop the pending debounce if the editor unmounts mid-typing.
  useEffect(
    () => () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  const setOutput = useCallback(
    (next: unknown) => {
      setOutputState(next);
      const json = JSON.stringify(next ?? {});
      writeDraft(key, json);
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        retryCountRef.current = 0; // a fresh edit restarts the retry budget
        // A terminal/gave-up state resets while the user edits again — the
        // indicator hides until the next save reports.
        setStatus((s) =>
          s.kind === "gave-up" || s.kind === "terminal" ? { kind: "idle" } : s,
        );
        startSave(json);
      }, DEBOUNCE_MS);
    },
    [key, startSave],
  );

  const discardDraft = useCallback(() => {
    clearDraft(key);
  }, [key]);

  /*
   * Story 2.4 (UX-DR32 conflict path): adopt the server's output for this
   * phase when a poll detects another writer. Unsaved local input always
   * wins — if the draft buffer holds edits the server does not have, or a
   * debounced save is pending (both mean "the user typed more than the
   * server knows"), this is a no-op. Returns true when the server value was
   * adopted, false when local edits were preserved — the editor uses that to
   * choose the regular vs. conflict toast copy. Never schedules a save and
   * never touches the draft key: adopting server data is not a user edit.
   */
  const adoptServerValue = useCallback(
    (next: unknown): boolean => {
      if (debounceRef.current !== null || readDraft(key) !== null) return false;
      setOutputState(next);
      return true;
    },
    [key],
  );

  // Restore routes through setOutput (not setOutputState directly) so the
  // restored draft follows the normal debounced save (Task 4.2) — a restore
  // that only updated local state would never reach the server.
  const restoreDraft = useCallback((): boolean => {
    const raw = readDraft(key);
    if (raw === null) return false;
    try {
      setOutput(JSON.parse(raw) as unknown);
      return true;
    } catch {
      return false;
    }
  }, [key, setOutput]);

  return {
    output,
    setOutput,
    status,
    draftKey: key,
    restoreDraft,
    discardDraft,
    adoptServerValue,
  };
}
