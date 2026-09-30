"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { getCollabSnapshot } from "@/actions/collab";
import { DRAFT_EVENT } from "@/hooks/use-auto-save";
import type { CollabResult, CollabSnapshot } from "@/lib/collab-types";
import { POLL_INTERVAL_MS } from "@/lib/constants";

/*
 * Story 2.4 — the collaboration polling engine (NFR3, AD-3, ARCH-5).
 *
 * SWAP POINT for WebSocket (post-MVP): this file is the single seam —
 * replacing it must not require touching any component. Everything the
 * component tree could need (pause controls, snapshot callback) lives here.
 *
 * Behavior contract:
 * - Polls `getCollabSnapshot(discoveryId)` every POLL_INTERVAL_MS (10s). The
 *   cycle-0 tick runs WITHOUT `since`, so the response doubles as a one-time
 *   silent refresh + baseline; later ticks send the last-seen max updatedAt
 *   and the server answers `{ changed: false }` for ~90% of polls.
 * - Pauses while the user is typing: every editor keystroke writes the
 *   localStorage draft, which dispatches DRAFT_EVENT. The tick checks the
 *   pause condition and reschedules (skip-and-retry, not timer churn); it
 *   resumes 1s after the last WRITE-kind event. Save-completed clears carry
 *   detail.kind "clear" and do NOT restart the resume clock — they are not
 *   keystrokes (NFR3: "resumes 1s after typing stops").
 * - Pauses while a modal or sheet is open, via acquirePause() — a refcounted
 *   module store so any future overlay (2.11 modals, 3.1 invite sheet) can
 *   pause polling without prop drilling or a context provider (none exist in
 *   this codebase by design).
 * - Poll failures are silent (EXPERIENCE.md: "On poll failure: no visible
 *   indication. The next poll will retry.") — EXCEPT auth_required, which
 *   stops the loop: a dead session fails every poll identically forever, and
 *   the auto-save terminal path already surfaces the sign-in UX.
 *
 * Lint discipline (the team's recurring trap): the only setState-shaped work
 * here is onSnapshotRef assignment in a render-agnostic effect; all other
 * side effects run in timer callbacks or the poll's async continuation.
 */

const TYPING_RESUME_MS = 1000; // NFR3: resume 1s after the last keystroke

/* ------------------------------------------------------------------ */
/* Modal/sheet pause store (UX-DR27: "Pauses when modal or sheet open") */
/* ------------------------------------------------------------------ */

let pauseCount = 0;
const pauseListeners = new Set<() => void>();

function emitPauseChange(): void {
  for (const listener of pauseListeners) listener();
}

/*
 * Pause collaboration polling until the returned release function runs.
 * Refcounted: overlapping overlays each acquire once; polling resumes only
 * when every reason has released. `reason` exists for debugging call sites.
 * First consumers: Story 2.11 (modals), Story 3.1 (invite sheet).
 */
export function acquirePause(reason: string): () => void {
  void reason; // call-site label only — refcounting is per-acquire, not per-reason
  pauseCount += 1;
  emitPauseChange();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pauseCount = Math.max(0, pauseCount - 1);
    emitPauseChange();
  };
}

function subscribePause(onChange: () => void): () => void {
  pauseListeners.add(onChange);
  return () => {
    pauseListeners.delete(onChange);
  };
}

/* ------------------------------------------------------------------ */
/* The hook                                                            */
/* ------------------------------------------------------------------ */

export function useCollaboration(
  discoveryId: string,
  options?: {
    onSnapshot?: (
      snapshot: CollabSnapshot,
      meta: { initial: boolean },
    ) => void;
  },
): void {
  // The editor re-creates the onSnapshot closure every render; hold it in a
  // ref so the interval neither restarts nor reads a stale closure.
  const onSnapshotRef = useRef(options?.onSnapshot);
  useEffect(() => {
    onSnapshotRef.current = options?.onSnapshot;
  });

  // Editor keystrokes arrive here as draft-write events. Only the timestamp
  // changes — no re-render, the tick reads the ref at poll time.
  const lastTypingAtRef = useRef(0);
  useEffect(() => {
    const onDraftChange = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        (event.detail as { kind?: string } | null)?.kind !== "write"
      ) {
        return; // save-completed clear / discard — not a keystroke
      }
      lastTypingAtRef.current = Date.now();
    };
    window.addEventListener(DRAFT_EVENT, onDraftChange);
    return () => window.removeEventListener(DRAFT_EVENT, onDraftChange);
  }, []);

  const pausedByUi = useSyncExternalStore(
    subscribePause,
    () => pauseCount,
    () => 0,
  );

  // Max phase updatedAt already seen — the `since` of the next poll. Persists
  // across pause/resume; null until the cycle-0 baseline lands.
  const sinceRef = useRef<string | null>(null);
  // auth_required stops the loop for this mount (a dead session fails every
  // poll identically; re-sign-in remounts the page).
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (pausedByUi > 0 || stoppedRef.current) return;
    let cancelled = false;
    let timer: number | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timer = window.setTimeout(tick, delayMs);
    };

    const tick = async (): Promise<void> => {
      // Typing pause is evaluated at poll time: skip + reschedule (race-free
      // vs. clearing/restarting the timer on every keystroke).
      const sinceTyping = Date.now() - lastTypingAtRef.current;
      if (sinceTyping < TYPING_RESUME_MS) {
        schedule(TYPING_RESUME_MS - sinceTyping);
        return;
      }

      let result: CollabResult;
      try {
        result = await getCollabSnapshot(
          discoveryId,
          sinceRef.current ?? undefined,
        );
      } catch {
        // Network drop: silent, the next poll retries (EXPERIENCE.md).
        schedule(POLL_INTERVAL_MS);
        return;
      }
      if (cancelled) return;

      if (!result.ok) {
        if (result.error.code === "auth_required") {
          stoppedRef.current = true;
          return; // silent stop — the auto-save terminal path owns the message
        }
        // Any other typed failure (not_found, server_error, …): silent retry.
        schedule(POLL_INTERVAL_MS);
        return;
      }

      if (result.changed && result.snapshot) {
        onSnapshotRef.current?.(result.snapshot, {
          initial: sinceRef.current === null,
        });
        sinceRef.current = result.snapshot.phases.reduce(
          (max, phase) => (phase.updatedAt > max ? phase.updatedAt : max),
          sinceRef.current ?? "",
        );
      }
      schedule(POLL_INTERVAL_MS);
    };

    schedule(POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [discoveryId, pausedByUi]);
}
