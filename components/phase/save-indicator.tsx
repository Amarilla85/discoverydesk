"use client";

import { useEffect, useState } from "react";
import type { SaveStatus } from "@/hooks/use-auto-save";

/*
 * Story 2.3 — auto-save indicator (AC 2/3, UX-DR28): fixed bottom-right,
 * caption-sm, "Saved {N}s ago" ticking from the last completed save;
 * destructive copy while failing. EXPERIENCE.md a11y floor: aria-live="off"
 * explicitly — ambient feedback, never announced. tabular-nums keeps the
 * seconds digit from jittering (UX-DR2 numeric displays).
 *
 * Toast collision: the toast (components/ui/toast.tsx) renders at
 * bottom-12/right-6 — one spacing stop above this indicator's baseline
 * (bottom-6 + ~16px text height ≈ 40px), so the two never overlap.
 *
 * The elapsed count lives in state updated from the interval callback only —
 * no setState in the effect body, no Date.now() during render.
 */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status.kind !== "saved") return;
    const update = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - status.at) / 1000)));
    const initial = window.setTimeout(update, 0);
    const id = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [status]);

  if (status.kind === "idle") return null;

  let text: string;
  let tone: string;
  if (status.kind === "saved") {
    text = `Saved ${elapsed}s ago`;
    tone = "text-on-surface-variant";
  } else if (status.kind === "retrying") {
    text = "Couldn't save. Retrying.";
    tone = "text-destructive";
  } else if (status.kind === "gave-up") {
    // The toast carries the full connection message (AC 3).
    text = "Couldn't save.";
    tone = "text-destructive";
  } else {
    text = status.message;
    tone = "text-destructive";
  }

  return (
    <p
      aria-live="off"
      className={`fixed bottom-6 right-6 z-toast text-caption-sm tabular-nums ${tone}`}
    >
      {text}
    </p>
  );
}
