import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import type { InviteSheetCollaborator } from "@/components/discovery/invite-sheet";

/**
 * Two-column application layout (UX-DR6): fixed sidebar + flexible main with
 * sticky top bar. Workspace content is centered at the 960px max content
 * width (DESIGN.md layout model).
 */
export function AppShell({
  children,
  discoveryName,
  discoveryId,
  canRename,
  markApproved,
  invite,
}: {
  children: React.ReactNode;
  discoveryName?: string;
  // Story 2.14: pass-through for the top bar's live rename control —
  // both props together enable the EditableDiscoveryName island.
  discoveryId?: string;
  canRename?: boolean;
  // Story 2.12: pass-through for the top bar's "Mark Approved" island —
  // undefined (the list page) renders the bar exactly as before.
  markApproved?: {
    discoveryId: string;
    ready: boolean;
    approved: boolean;
  };
  // Story 3.1 (FR3): pass-through for the top bar's InviteSheet island —
  // undefined (the list page) renders the bar without an invite control.
  invite?: {
    discoveryId: string;
    canInvite: boolean;
    ownerName?: string;
    ownerEmail?: string;
    collaborators: InviteSheetCollaborator[];
  };
}) {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          discoveryName={discoveryName}
          discoveryId={discoveryId}
          canRename={canRename}
          markApproved={markApproved}
          invite={invite}
        />
        <main id="main-content" className="mx-auto w-full max-w-[960px] flex-1 px-6 py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
