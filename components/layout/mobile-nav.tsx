"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";

import { SidebarNav } from "./sidebar-nav";
import { Wordmark } from "./wordmark";

/**
 * sm-only drawer (<768px): menu button in the top bar opens a left drawer
 * over a modal overlay. Closes on Escape and overlay click (UX-DR26 baseline).
 * Hand-rolled — no Sheet dependency (AD-9).
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
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
          <div className="absolute inset-y-0 left-0 flex w-60 flex-col gap-6 bg-surface-variant p-4 shadow-level-2">
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
