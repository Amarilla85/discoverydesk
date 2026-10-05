"use client";

import type { CollaboratorRole } from "@prisma/client";
import { ChevronDown, X, UserPlus } from "lucide-react";
import { signIn } from "next-auth/react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import {
  inviteCollaborator,
  type InviteCollaboratorState,
} from "@/actions/discoveries";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { acquirePause } from "@/hooks/use-collaboration";
import { FOCUSABLE_SELECTOR, useFocusTrap } from "@/hooks/use-focus-trap";
import { signInSchema } from "@/lib/schemas/auth";

/*
 * Story 3.1 (FR3, UX-DR14) — the invite sheet: a right-side drawer opened
 * from the top bar's Invite button. Header "Invite Collaborators" + close
 * button; email input + role select + "Send Invite"; the collaborator list
 * (pending invites included) below.
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
 * The invite EMAIL (AC 2): after inviteCollaborator commits the pending row,
 * this island calls signIn("email", { email, callbackUrl }) — the standard
 * NextAuth magic-link flow becomes the invite email, and its verification
 * URL embeds callbackUrl, so the link lands on this Discovery. Rationale
 * (story Task 3): the hand-rolled Resend provider in lib/auth.ts is the only
 * sender; a server-side custom email would duplicate VerificationToken
 * creation AND the sha256(token + secret) storage convention (a hand-rolled
 * token row is silently unclickable — the 1.2 debug lesson) AND the Resend
 * fetch. signIn is awaited with try/catch (the 1.2 review bug: fire-and-
 * forget showed false success); on failure the row still exists and
 * re-clicking Send Invite is an idempotent upsert + re-send.
 *
 * MOUNT CONTRACT: TopBar renders this island (trigger included) whenever
 * `invite` is provided with canInvite — the island owns trigger + sheet so
 * the success toast survives the action's revalidation flight.
 */
export type InviteSheetCollaborator = {
  id: string;
  email: string;
  role: CollaboratorRole;
  // userId === null — the invite has not been claimed by a sign-in yet.
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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CollaboratorRole>("Stakeholder");
  // Client-side pre-validation error ( signInSchema) — blocks the dispatch
  // entirely (AC 4: invalid email → "the invite is not sent"). The server
  // envelope stays the backstop for tampered POSTs (AD-12).
  const [clientError, setClientError] = useState<string | null>(null);
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
    // Focus the email input (first focusable in the panel). focus() is a DOM
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

  const inviteAction = useCallback(
    async (
      _prevState: InviteCollaboratorState | null,
      formData: FormData,
    ): Promise<InviteCollaboratorState> => {
      let result: InviteCollaboratorState;
      try {
        result = await inviteCollaborator(null, formData);
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
        // Row committed: clear the input for the next invite and confirm.
        setEmail("");
        setToast({
          id: toastSeqRef.current,
          variant: "success",
          message: "Invite sent.",
        });
        // The email send rides the existing magic-link pipeline (see the
        // file comment). A send failure leaves the pending row in place —
        // re-clicking Send Invite re-sends (upsert is a no-op write).
        const inviteeEmail = String(formData.get("email") ?? "");
        try {
          await signIn("email", {
            email: inviteeEmail,
            callbackUrl: `/discoveries/${discoveryId}`,
          });
        } catch {
          toastSeqRef.current += 1;
          setToast({
            id: toastSeqRef.current,
            variant: "destructive",
            message: "Invite saved, but the email couldn't be sent. Try again.",
          });
        }
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
    [discoveryId],
  );

  const [state, dispatch, isPending] = useActionState(inviteAction, null);

  const handleSend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Implicit submission (Enter in the email field) fires even with the Send
    // button disabled — serialize it out here, not just on the button.
    if (isPending) return;
    const parsed = signInSchema.safeParse(email);
    if (!parsed.success) {
      setClientError("Please enter a valid email address.");
      return;
    }
    setClientError(null);
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("email", email);
    formData.set("role", role);
    dispatch(formData);
  };

  // The inline error below the email input (UX-DR10: destructive message
  // below the field): client pre-validation wins; otherwise the action's
  // envelope error for the email field.
  const actionError = state && !state.ok ? state.error : null;
  const emailError =
    clientError ??
    (actionError?.field === "email" ? actionError.message : null);

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

            <form onSubmit={handleSend} aria-label="Invite a collaborator" className="flex flex-col gap-2">
              <label htmlFor="invite-email" className="text-label text-on-surface">
                Email
              </label>
              <input
                id="invite-email"
                name="email"
                type="text"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "invite-email-error" : undefined}
                className={
                  emailError
                    ? // UX-DR10 error state: 2px destructive border (Task 4.4).
                      "h-10 rounded-sm border-2 border-destructive bg-surface px-3 text-body text-on-surface placeholder:text-on-surface-disabled"
                    : "h-10 rounded-sm border border-outline bg-surface px-3 text-body text-on-surface placeholder:text-on-surface-disabled"
                }
              />
              {emailError ? (
                <p
                  id="invite-email-error"
                  role="alert"
                  className="text-body-sm text-destructive"
                >
                  {emailError}
                </p>
              ) : null}
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
                Stakeholders view and comment. BAs edit phases and can invite
                others.
              </p>
              <div>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Sending…" : "Send Invite"}
                </Button>
              </div>
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
 * One list row (UX-DR14: email + role, pending invites included). The
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
