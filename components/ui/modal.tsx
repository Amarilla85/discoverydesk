"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/*
 * Story 2.12 — the app's first modal (UX-DR16 / DESIGN.md modal spec).
 * Hand-rolled, no Radix Dialog (the codebase's overlay precedent:
 * components/layout/mobile-nav.tsx). Bones: fixed inset-0 z-modal-overlay,
 * bg-modal-overlay backdrop, centered content panel — bg-surface, rounded-xl
 * (12px), shadow-level-3, max-w-[560px], p-8; header = title + close icon
 * top-right; footer right-aligned above a border-t border-outline-variant.
 *
 * Behaviors (UX-DR16): Escape closes; a click on the backdrop (not the panel)
 * closes; body scroll is locked while open (event/lifecycle-driven DOM writes,
 * not setState — the team's recurring set-state-in-effect trap does not
 * apply); focus moves to the first focusable element inside on open and
 * returns to the triggering element on close. Deliberately NOT a focus trap —
 * full modal focus management is Story 2.13's sweep (the 1-3 deferral note).
 *
 * Polling pause: the CONSUMER owns it — call acquirePause("…") on open and
 * the returned release on close (hooks/use-collaboration.ts's refcounted
 * store was built for exactly this; keeping it out of the shared component
 * leaves non-workspace uses free to skip it).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Return-focus target: the element that had focus when the modal opened
    // (the consumer's trigger button).
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Focus the first interactive element inside the panel (the close
    // button, top-right). focus() is a DOM write — lint-safe in an effect.
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea",
    );
    firstFocusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-modal-overlay" onClick={onClose} />
      {/* Centered above the backdrop (the flex wrapper ignores pointer events
          so backdrop clicks reach the backdrop div). */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          className="pointer-events-auto relative w-full max-w-[560px] rounded-xl bg-surface p-8 shadow-level-3"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface hover:bg-hover-overlay"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          <h2 className="text-h2 text-on-surface">{title}</h2>
          <div className="mt-4 text-body text-on-surface">{children}</div>
          <div className="mt-8 flex justify-end gap-3 border-t border-outline-variant pt-4">
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
