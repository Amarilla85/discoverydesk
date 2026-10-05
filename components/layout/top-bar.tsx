import { Settings } from "lucide-react";

import { MarkApprovedButton } from "./mark-approved-button";
import { EditableDiscoveryName } from "./editable-discovery-name";
import { MobileNav } from "./mobile-nav";
import { Wordmark } from "./wordmark";
import {
  InviteSheet,
  type InviteSheetCollaborator,
} from "@/components/discovery/invite-sheet";

/**
 * Sticky top bar (UX-DR6): wordmark left, Discovery name center
 * (inline-editable, rendered only when a name is provided), action buttons
 * right. The Print View button is deferred with FR-15 (Decision 2026-09-11).
 *
 * Story 3.1 (FR3, UX-DR14): the Invite button is live — rendered by the
 * InviteSheet island (trigger included) ONLY when `invite.canInvite`
 * (Owner or BA Collaborator, resolved server-side; hidden, not disabled,
 * matching the rename grant's pattern). Omitting the `invite` prop — as the
 * Discovery List does — renders the bar without any invite control.
 *
 * Story 2.14: the center name is live — the workspace page passes
 * discoveryId + canRename (Owner or BA Collaborator, resolved server-side)
 * and the name saves via the renameDiscovery action inside the
 * EditableDiscoveryName island. A name without that pair renders plain text.
 *
 * Story 2.12 (FR13): "Mark Approved" is live — the click runs the
 * approveDiscovery Server Action (lifecycle flip, approval record, toast) via
 * the client island. The island renders whenever `markApproved` is provided
 * (workspace pages only — omitting the prop, as the Discovery List does,
 * renders the bar exactly as before), INCLUDING on an approved discovery:
 * the island hides its own button when `approved` flips, but must stay
 * mounted so its success toast survives the same-flight RSC refresh (its
 * mount contract). The button state itself: disabled until every phase is
 * Approved, hidden once the Discovery is Approved (terminal-locked).
 */
export function TopBar({
  discoveryName,
  discoveryId,
  canRename,
  markApproved,
  invite,
}: {
  discoveryName?: string;
  // Story 2.14: the rename grant rides with the name — the workspace page
  // passes both plus the id the rename action targets. Name without the
  // pair (nothing sets that today) degrades to plain text.
  discoveryId?: string;
  canRename?: boolean;
  markApproved?: {
    discoveryId: string;
    ready: boolean;
    approved: boolean;
  };
  // Story 3.1 (FR3): the invite sheet's data + grant. The collaborator list
  // is server-resolved (pending rows included — visible to members via the
  // explicit select, not the access filter).
  invite?: {
    discoveryId: string;
    canInvite: boolean;
    ownerName?: string;
    ownerEmail?: string;
    collaborators: InviteSheetCollaborator[];
  };
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-surface px-4 shadow-sticky">
      <MobileNav />
      <Wordmark />
      <div className="flex min-w-0 flex-1 justify-center">
        {discoveryName ? (
          discoveryId !== undefined && typeof canRename === "boolean" ? (
            <EditableDiscoveryName
              name={discoveryName}
              discoveryId={discoveryId}
              canRename={canRename}
            />
          ) : (
            <p className="truncate px-2 py-1 text-h1 text-on-surface">
              {discoveryName}
            </p>
          )
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {markApproved !== undefined ? (
          <MarkApprovedButton
            discoveryId={markApproved.discoveryId}
            ready={markApproved.ready}
            approved={markApproved.approved}
          />
        ) : null}
        {invite?.canInvite ? (
          <InviteSheet
            discoveryId={invite.discoveryId}
            ownerName={invite.ownerName}
            ownerEmail={invite.ownerEmail}
            collaborators={invite.collaborators}
          />
        ) : null}
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
