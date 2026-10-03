"use client";

import { useState } from "react";

/*
 * Story 2.13 — stable React keys for repeating form rows (the deferred
 * index-key fix from the 2-7/2-10 reviews, landing once for all phase
 * forms). `key={index}` shifts on mid-list delete: the row below the deleted
 * one inherits the deleted row's DOM node (controlled value swapped under
 * the caret, useId-derived labels/aria shift rows). This hook hands out one
 * client-side key per row, kept in lockstep with the list's mutations:
 *
 * - Initialized once at mount from the list's initial length (a seeded
 *   output or a blank form). A server adoption arrives via a keyed remount
 *   (phase-editor.tsx), which re-runs the initializer — no re-sync needed.
 * - ADD: call `add()` in the same handler that appends the row. (A forgotten
 *   call degrades gracefully — an unkeyed row falls back to React's
 *   positional behavior — but every handler in this codebase calls it.)
 * - REMOVE: call `removeAt(index)` BEFORE the list update in the remove
 *   handler, so surviving rows keep their keys.
 * - REORDER: call `swap(a, b)` with the same index pair the rows swap by.
 *
 * All key mutations happen inside event handlers (setState in event context
 * — the codebase's lint-safe pattern); no ref is touched during render
 * (react-hooks/refs). Keys are CLIENT-SIDE ONLY — never persisted into
 * Phase.output and never added to the Zod schemas (AD-11: a schema change
 * would ripple to Server Actions for zero server value). Keys are not
 * rendered into the DOM, so random keys are hydration-safe.
 */
export function useStableRowKeys(initialLength: number) {
  const [keys, setKeys] = useState<string[]>(() =>
    Array.from({ length: initialLength }, () => newRowKey()),
  );

  return {
    keys,
    add: (count = 1) =>
      setKeys((prev) => [
        ...prev,
        ...Array.from({ length: count }, () => newRowKey()),
      ]),
    // Bounds-guarded (code-review hardening): an out-of-range index would
    // otherwise silently desync the keys from the row array.
    removeAt: (index: number) =>
      setKeys((prev) =>
        index < 0 || index >= prev.length
          ? prev
          : prev.filter((_, i) => i !== index),
      ),
    swap: (a: number, b: number) =>
      setKeys((prev) => {
        if (
          a === b ||
          a < 0 ||
          b < 0 ||
          a >= prev.length ||
          b >= prev.length
        ) {
          return prev;
        }
        const next = [...prev];
        [next[a], next[b]] = [next[b], next[a]];
        return next;
      }),
  };
}

export function newRowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Math.random().toString(36).slice(2)}`;
}
