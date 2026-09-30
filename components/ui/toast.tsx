"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Story 2.3 — minimal toast primitive (AC 3), DESIGN.md `toast` /
 * `toast-destructive` / `toast-info` tokens: fixed bottom-right, rounded-lg,
 * min 280px, body-sm text, spacing.3/spacing.4 padding,
 * `0 8px 32px rgba(0,0,0,0.12)` shadow, z-index 1100 (`z-toast`), 200ms
 * slide-up in / fade-out.
 *
 * Story 2.4 extension (this file's reserved consumers: 2.4 polling, 2.11
 * sign-off): the `info` variant ("Updated by {name}." toasts, UX-DR27) and
 * hover-pause (UX-DR17: timer pauses on hover, dismisses 1s after the pointer
 * leaves). Destructive behavior is unchanged for the existing 2.3 consumer.
 * STILL DEFERRED by design: the `success` variant (2.11's consumer), a toast
 * context/provider, and vertical stacking with a max-3 queue — this story
 * renders at most one polling toast at a time; 2.11 owns the next step.
 *
 * Auto-dismiss (UX-DR17: 4s destructive, 2s info): timers fire in callbacks —
 * no setState in the effect body. `closing` flips the exit animation on,
 * `onDismiss` unmounts 200ms later. Hover-pause cancels the pending dismiss
 * (only before closing starts — after that the exit animation must finish
 * and unmount). Motion rules: ≤200ms, motion-reduce disables the transitions.
 * Destructive: role="alert" + aria-live="assertive"; info: role="status" +
 * aria-live="polite" (EXPERIENCE.md a11y floor). Not focusable — no keyboard
 * trap.
 */
export function Toast({
  variant = "destructive",
  autoDismissMs,
  onDismiss,
  children,
}: {
  variant?: "destructive" | "info";
  autoDismissMs?: number;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const dismissMs = autoDismissMs ?? (variant === "info" ? 2000 : 4000);
  const hideTimerRef = useRef<number | null>(null);
  const removeTimerRef = useRef<number | null>(null);

  const cancelTimers = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (removeTimerRef.current !== null) {
      window.clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }
  }, []);

  const scheduleDismiss = useCallback(
    (delayMs: number) => {
      cancelTimers();
      hideTimerRef.current = window.setTimeout(() => {
        setClosing(true);
        removeTimerRef.current = window.setTimeout(onDismiss, 200);
      }, delayMs);
    },
    [cancelTimers, onDismiss],
  );

  useEffect(() => {
    scheduleDismiss(dismissMs);
    return cancelTimers;
  }, [scheduleDismiss, dismissMs, cancelTimers]);

  // UX-DR17 hover-pause: pause while hovered (cancel the pending dismiss;
  // a toast already playing its exit animation is left alone so it can
  // still unmount), dismiss 1s after the pointer leaves.
  const onMouseEnter = () => {
    if (!closing) cancelTimers();
  };
  const onMouseLeave = () => {
    if (!closing) scheduleDismiss(1000);
  };

  const variantClasses =
    variant === "info"
      ? "border border-outline bg-surface text-on-surface"
      : "bg-destructive text-destructive-foreground";

  return (
    <div
      role={variant === "info" ? "status" : "alert"}
      aria-live={variant === "info" ? "polite" : "assertive"}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed bottom-12 right-6 z-toast min-w-[280px] max-w-[400px] rounded-lg px-4 py-3 text-body-sm shadow-[0_8px_32px_rgba(0,0,0,0.12)] ${variantClasses} ${
        closing
          ? "animate-out fade-out duration-200 motion-reduce:transition-none"
          : "animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:transition-none"
      }`}
    >
      {children}
    </div>
  );
}
