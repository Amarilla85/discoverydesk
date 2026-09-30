"use client";

import { cn } from "@/lib/utils";

/*
 * Story 2.5 — UX-DR23 slider (first consumer; Story 2.6 reuses it for the
 * severity/frequency/impact/relevance sliders, so props stay phase-agnostic).
 *
 * Native <input type="range"> — no dependency: keyboard arrows and
 * aria-valuenow come free, and step=1 IS the integer snapping the spec asks
 * for. Styling per DESIGN.md's slider tokens (line ~363): 4px track, 4px
 * radius, 16px thumb with a 2px primary border. The current value renders
 * next to the thumb (positioned at the thumb's percentage, corrected for the
 * 16px thumb width) and a tooltip shows the value on hover/focus-visible
 * (UX-DR23; focus keeps the DR22 visible-ring via the focus-ring shadow on
 * the thumb). motion-reduce pins the cheap 2.13 item, same as 2.4's toast.
 */
export function Slider({
  value,
  onChange,
  min = 1,
  max = 5,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  className?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  // Thumb center: pct% of (track width - thumb width) + half thumb.
  const thumbLeft = `calc(${pct}% + ${8 - (pct / 100) * 16}px)`;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-4 flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-label={ariaLabel}
          onChange={(event) => onChange(Number(event.target.value))}
          className="peer h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-sm [&::-webkit-slider-runnable-track]:bg-outline-variant
            [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:transition-shadow
            focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_3px_var(--focus-ring)]
            [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-sm [&::-moz-range-track]:bg-outline-variant
            [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-surface [&::-moz-range-thumb]:transition-shadow
            focus-visible:[&::-moz-range-thumb]:shadow-[0_0_0_3px_var(--focus-ring)]
            motion-reduce:[&::-webkit-slider-thumb]:transition-none motion-reduce:[&::-moz-range-thumb]:transition-none"
        />
        {/* Value next to the thumb — persistent (UX-DR23). */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-5 -translate-x-1/2 text-caption tabular-nums text-on-surface-variant"
          style={{ left: thumbLeft }}
        >
          {value}
        </span>
        {/* Tooltip on hover/focus with the current value (UX-DR23). Pure CSS
            reveal — no timer state, keeping the set-state-in-effect trap out. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-6 -translate-x-1/2 rounded-sm border border-outline-variant bg-surface px-1.5 py-0.5 text-caption tabular-nums text-on-surface opacity-0 shadow-level-2 transition-opacity duration-150 peer-hover:opacity-100 peer-focus-visible:opacity-100 motion-reduce:transition-none"
          style={{ left: thumbLeft }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
