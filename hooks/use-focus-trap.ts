"use client";

import { useEffect, type RefObject } from "react";

// Shared focusable-element test (Story 2-13 code-review fix): the trap and
// every focus-in consumer must agree on what "focusable" means — mobile-nav
// imports this instead of hand-rolling a divergent selector.
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/*
 * Story 2.13 — shared focus trap for the app's hand-rolled overlays
 * (components/ui/modal.tsx, components/layout/mobile-nav.tsx). While
 * `active`, Tab/Shift+Tab cycle within the container's focusable elements
 * (queried fresh on every keydown — no caching); if focus has escaped the
 * container (programmatic focus loss), the next Tab pulls it back inside.
 *
 * Listeners are event-driven DOM work only — no setState in effects (the
 * team's recurring react-hooks/set-state-in-effect trap). Focus-in on open,
 * focus-return on close, and body scroll lock remain the CONSUMER's
 * responsibility (both overlays already own those behaviors).
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      // Focus escaped the overlay (or never entered) — pull it back in.
      if (!current || !container.contains(current)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey) {
        if (current === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Window-level, like the overlays' Escape listeners: keydown fires here
    // even when focus sits on the backdrop or body, so Tab can never slip
    // out to the page behind the overlay.
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, containerRef]);
}
