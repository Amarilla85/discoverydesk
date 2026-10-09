"use client";

import type { CollaboratorRole } from "@prisma/client";
import { ChevronDown, X, UserPlus } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import {
  generateInviteLink,
  type InviteLinkState,
} from "@/actions/discoveries";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { acquirePause } from "@/hooks/use-collaboration";
import { FOCUSABLE_SELECTOR, useFocusTrap } from "@/hooks/use-focus-trap";

/*
 * Story 3.1/4.1 (FR3, UX-DR14) — the invite sheet: a right-side drawer opened
 * from the top bar's Invite button. Header "Invite Collaborators" + close
 * button; role select + "Copy invite link"; the collaborator list (legacy
 * pending invites included) below.
 *
 * INVITES ARE LINK-BASED SINCE 4.1 (Decision 2026-10-09): the email handoff
 * (inviteCollaborator + awaited signIn("email")) is REMOVED — Resend 403s
 * every recipient except the Owner, so magic-link invitations could never
 * reach real collaborators. Instead the Owner/BA picks a role, the action
 * mints a signed role-encoded token (lib/invite-token.ts, stateless HMAC —
 * no Invitation table), and the sheet copies `/invite/{token}` to the
 * clipboard for sharing over any channel. The invitee lands on the invite
 * page and creates an email+password account (actions/auth.ts). Legacy
 * pending Collaborator rows from the magic-link era still render with the
 * Pending badge and are still claimed by the events.signIn hook — no new
 * list semantics (Task 6.2).
 *
 * Geometry/a11y skeleton mirrors the hand-rolled overlay precedents —
 * components/layout/mobile-nav.tsx (side panel over bg-modal-overlay,
 * conditional render, Escape/backdrop close, focus-in + focus-return +
 * scroll lock in ONE effect keyed on `open`) and components/ui/modal.tsx
 * (no shadcn Sheet exists or should exist — AD-9). The focus trap is the
 * shared useFocusTrap hook (Story 2.13 parity for sheets).
 *
 * Polling pause (UX-DR27): acquirePause("invite-sheet") on open — the exact
 * contract reserved for this component in hooks/use-collaboration.ts's
 * comments — released in the open-effect cleanup, so Escape, backdrop, and
 * any future close path all release (the release is idempotent).
 *
 * Clipboard (Task 6.1): on `ok` the island writes the URL via
 * navigator.clipboard (secure contexts) and toasts "Invite link copied.".
 * Clipboard unavailability/failure (non-secure contexts, denied permission)
 * falls back to a read-only input with the URL for manual copy.
 *
 * MOUNT CONTRACT: TopBar renders this island (trigger included) whenever
 * `invite` is provided with canInvite — the island owns trigger + sheet so
 * the success toast survives the action's revalidation flight.
 */
export type InviteSheetCollaborator = {
  id: string;
  email: string;
  role: CollaboratorRole;
  // userId === null — a legacy (magic-link era) invite not yet claimed by a
  // sign-in. New link invites claim their row at signup, so they never show
  // as pending.
  pending: boolean;
  name?: string;
};

const INVITE_SHEET_PAUSE_REASON = "invite-sheet";

export function InviteSheet({
  discoveryId,
  ownerName,
  ownerEmail,
  collaborators,
}: {
  discoveryId: string;
  ownerName?: string;
  ownerEmail?: string;
  collaborators: InviteSheetCollaborator[];
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<CollaboratorRole>("Stakeholder");
  // Set only when the clipboard write fails — the read-only manual-copy
  // fallback shows the URL until the next attempt replaces it.
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    variant: "success" | "destructive";
    message: string;
  } | null>(null);
  const [toastClosed, setToastClosed] = useState(false);
  const toastSeqRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const releasePauseRef = useRef<(() => void) | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    // Focus the role select (first focusable in the panel). focus() is a DOM
    // write — lint-safe in an effect, same as the drawer/modal pattern.
    panelRef.current
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
      // Every close path (Escape, backdrop, future close buttons) funnels
      // through setOpen(false) → this cleanup → the release.
      releasePauseRef.current?.();
      releasePauseRef.current = null;
      trigger?.focus();
    };
  }, [open]);

  const openSheet = () => {
    if (open) return; // one acquire per open — a re-click must not leak the pause refcount
    releasePauseRef.current = acquirePause(INVITE_SHEET_PAUSE_REASON);
    setOpen(true);
  };

  const copyLinkAction = useCallback(
    async (
      _prevState: InviteLinkState | null,
      formData: FormData,
    ): Promise<InviteLinkState> => {
      let result: InviteLinkState;
      try {
        result = await generateInviteLink(null, formData);
      } catch {
        result = {
          ok: false,
          error: {
            code: "network_error",
            message: "Something went wrong. Please try again.",
          },
        };
      }
      toastSeqRef.current += 1;
      if (result.ok) {
        // Clipboard API exists only in secure contexts — feature-detect, and
        // treat a rejected write the same as an absent API (manual fallback).
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(result.url);
            setManualUrl(null);
            setToast({
              id: toastSeqRef.current,
              variant: "success",
              message: "Invite link copied.",
            });
            setToastClosed(false);
            return result;
          } catch {
            // fall through to the manual-copy fallback
          }
        }
        setManualUrl(result.url);
        setToast({
          id: toastSeqRef.current,
          variant: "destructive",
          message: "Couldn't copy the link. Copy it manually below.",
        });
      } else {
        // Retryable failure: keep the sheet state, surface the message.
        setToast({
          id: toastSeqRef.current,
          variant: "destructive",
          message: result.error.message,
        });
      }
      setToastClosed(false);
      return result;
    },
    [],
  );

  // The envelope error is surfaced via the toast, so the state slot stays
  // unused (link invites have no field-level form errors — the role select
  // only offers valid roles).
  const [, dispatch, isPending] = useActionState(copyLinkAction, null);

  const handleCopy = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Implicit submission (Enter in the select) fires even with the button
    // disabled — serialize it out here, not just on the button (3.1 review
    // fix pattern).
    if (isPending) return;
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("role", role);
    dispatch(formData);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Invite collaborators"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={openSheet}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface hover:bg-hover-overlay"
      >
        <UserPlus className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Invite Collaborators"
        >
          <div
            className="absolute inset-0 bg-modal-overlay"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col gap-6 overflow-y-auto bg-surface p-6 shadow-level-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-h2 text-on-surface">Invite Collaborators</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-on-surface hover:bg-hover-overlay"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCopy} aria-label="Copy an invite link" className="flex flex-col gap-2">
              <label htmlFor="invite-role" className="text-label text-on-surface">
                Role
              </label>
              <div className="relative">
                <select
                  id="invite-role"
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as CollaboratorRole)
                  }
                  className="h-10 w-full appearance-none rounded-sm border border-outline bg-surface px-3 pr-8 text-body text-on-surface"
                >
                  <option value="Stakeholder">Stakeholder</option>
                  <option value="BA">BA</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant"
                />
              </div>
              <p className="text-body-sm text-on-surface-variant">
                Stakeholders view, comment, and sign off. BAs also edit phases
                and can invite others. The link works for 30 days — share it
                with one person at a time.
              </p>
              <div>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Copying…" : "Copy invite link"}
                </Button>
              </div>
              {manualUrl ? (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="invite-manual-url"
                    className="text-label text-on-surface"
                  >
                    Invite link
                  </label>
                  <input
                    id="invite-manual-url"
                    type="text"
                    readOnly
                    value={manualUrl}
                    onFocus={(event) => event.target.select()}
                    className="h-10 rounded-sm border border-outline bg-surface px-3 text-body-sm text-on-surface"
                  />
                </div>
              ) : null}
            </form>

            <div className="flex flex-col gap-1">
              <p className="text-label text-on-surface-variant">Collaborators</p>
              {ownerEmail ? (
                <CollaboratorRow
                  label={ownerName ?? ownerEmail}
                  email={ownerEmail}
                  role="BA"
                  tag="Owner"
                />
              ) : null}
              {collaborators.map((collaborator) => (
                <CollaboratorRow
                  key={collaborator.id}
                  label={collaborator.name ?? collaborator.email}
                  email={collaborator.email}
                  role={collaborator.role}
                  tag={collaborator.pending ? "Pending" : undefined}
                />
              ))}
              {collaborators.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">
                  Invite stakeholders to review this Discovery.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {toast !== null && !toastClosed ? (
        <Toast
          key={toast.id}
          variant={toast.variant}
          onDismiss={() => setToastClosed(true)}
        >
          {toast.message}
        </Toast>
      ) : null}
    </>
  );
}

/*
 * One list row (UX-DR14: email + role, legacy pending invites included). The
 * "Pending" badge reuses the badge-in-review tokens (the hand-rolled
 * discovery-state-badge anatomy — no Badge component exists by design).
 */
function CollaboratorRow({
  label,
  email,
  role,
  tag,
}: {
  label: string;
  email: string;
  role: CollaboratorRole;
  tag?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-outline-variant py-2">
      <div className="min-w-0">
        <p className="truncate text-body text-on-surface">{label}</p>
        <p className="truncate text-caption text-on-surface-variant">{email}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {tag ? (
          <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-badge-in-review px-2 text-caption font-medium text-badge-in-review-text">
            {tag}
          </span>
        ) : null}
        <span className="text-caption text-on-surface-variant">{role}</span>
      </div>
    </div>
  );
}
