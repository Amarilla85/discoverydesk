import { Settings, UserPlus } from "lucide-react";

import { EditableDiscoveryName } from "./editable-discovery-name";
import { MobileNav } from "./mobile-nav";
import { Wordmark } from "./wordmark";

/**
 * Sticky top bar (UX-DR6): wordmark left, Discovery name center
 * (inline-editable, rendered only when a name is provided), action buttons
 * right. The Print View button is deferred with FR-15 (Decision 2026-09-11).
 * Invite and Settings are static icon buttons — their sheets arrive in
 * Stories 3.1 and later.
 */
export function TopBar({ discoveryName }: { discoveryName?: string }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-surface px-4 shadow-sticky">
      <MobileNav />
      <Wordmark />
      <div className="flex min-w-0 flex-1 justify-center">
        {discoveryName ? <EditableDiscoveryName name={discoveryName} /> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Invite collaborators"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface hover:bg-hover-overlay"
        >
          <UserPlus className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Settings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface hover:bg-hover-overlay"
        >
          <Settings className="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
