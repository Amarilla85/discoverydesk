"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";

import { FOCUSABLE_SELECTOR, useFocusTrap } from "@/hooks/use-focus-trap";

import { SidebarNav } from "./sidebar-nav";
import { Wordmark } from "./wordmark";

/**
 * sm-only drawer (<768px): menu button in the top bar opens a left drawer
 * over a modal overlay. Closes on Escape and overlay click (UX-DR26 baseline).
 * Hand-rolled — no Sheet dependency (AD-9).
 *
 * Story 2.13 (UX-DR16 parity for the sheet): focus moves to the first
 * focusable element inside on open and returns to the menu button on close;
 * body scroll is locked while open; Tab/Shift+Tab cycle inside the drawer
 * via the shared useFocusTrap hook. Focus/DOM work is event- and
 * lifecycle-driven — no setState in effects (the team's recurring ESLint
 * trap; the modal in components/ui/modal.tsx is the reference pattern).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(drawerRef, open);

  useEffect(() => {
    if (!open) return;
    // Focus the first interactive element inside the drawer (a SidebarNav
    // link). focus() is a DOM write — lint-safe in an effect, same as the
    // modal's focus-in.
    drawerRef.current
      ?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ?.focus();
    document.body.style.overflow = "hidden";

    // Capture the trigger node now (react-hooks/exhaustive-deps): the ref
    // may point elsewhere by the time this cleanup runs on close.
    const trigger = triggerRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface hover:bg-hover-overlay md:hidden"
      >
        <Menu className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-modal-overlay md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 bg-modal-overlay"
            onClick={() => setOpen(false)}
          />
          <div
            ref={drawerRef}
            className="absolute inset-y-0 left-0 flex w-60 flex-col gap-6 bg-surface-variant p-4 shadow-level-2"
          >
            <div className="px-2">
              <Wordmark />
            </div>
            <SidebarNav />
          </div>
        </div>
      )}
    </>
  );
}
