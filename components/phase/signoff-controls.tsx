"use client";

import type { PhaseType } from "@prisma/client";
import { useActionState, useCallback, useRef, useState } from "react";
import { approvePhase, type PhaseActionState } from "@/actions/phases";
import { requestChanges } from "@/actions/phases";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { useCollaboration } from "@/hooks/use-collaboration";
import type { CollabSnapshot } from "@/lib/collab-types";

/*
 * Story 2.11 (ACs 2–5) — the Stakeholder sign-off controls (UX-DR13) and the
 * read-only view's polling host (the Story 2.4 hand-off's first consumer).
 *
 * TWO-LAYER MOUNT CONTRACT (same rationale as submit-for-review.tsx): the
 * OUTER component is rendered in every unlocked phase branch as a stable JSX
 * slot and owns the action toasts — a sign-off's revalidatePath flips the
 * page to the next branch in the same flight response that resolves the
 * action, so "Approved by {name}." / "Changes requested by {name}. Returning
 * to Draft." must live somewhere that survives the flip. The INNER component
 * renders only while there is something to show: the buttons (Stakeholder ×
 * In Review) and the read-only polling host. Polling hosts stay single per
 * page: the editor owns the Draft+BA view, the inner host owns every other
 * live view (Draft Stakeholder, In Review — any role), and Approved polls
 * nothing (terminal in this story).
 *
 * The poll drives a lightweight version of the editor's 2.4 toast logic:
 * when THIS phase's updatedAt advances and the writer is named and foreign,
 * an info toast reads "Updated by {name}." There is no adopt/draft machinery
 * here by construction — nothing on the read-only view is editable — so the
 * divergence from phase-editor.tsx is deliberate.
 *
 * Server state is the source of truth: visibility comes in as props; the
 * component never mirrors phase state locally (the setState-in-effect trap
 * AND a stale-state bug).
 */
const GENERIC_ERROR = "Something went wrong. Please try again.";

export function SignoffControls({
  discoveryId,
  phaseType,
  visible,
  poll,
  approvedByName,
  viewerName,
}: {
  discoveryId: string;
  phaseType: PhaseType;
  // Stakeholder viewing an In Review phase → render the sign-off buttons.
  visible: boolean;
  // Mount the read-only polling host (Draft Stakeholder / In Review, any role).
  poll: boolean;
  // "Already approved by {name}" — a prior approve record on this phase
  // (server-derived; unreachable while In Review in this story, but the
  // EXPERIENCE.md sign-off states table's disabled state is wired for it).
  approvedByName: string | null;
  // The current user's name (name ?? email) — the {name} of the approve /
  // changes-requested confirmation toasts (the actor IS the current user).
  viewerName: string;
}) {
  const [toast, setToast] = useState<{
    id: number;
    variant: "success" | "info" | "destructive";
    message: string;
  } | null>(null);
  const [toastClosed, setToastClosed] = useState(false);
  const toastSeqRef = useRef(0);

  const showToast = useCallback(
    (variant: "success" | "info" | "destructive", message: string) => {
      toastSeqRef.current += 1;
      setToast({ id: toastSeqRef.current, variant, message });
      setToastClosed(false);
    },
    [],
  );

  // AC 3: Approve → phase Approved + confirmation toast. Green = approved/
  // done semantics (DESIGN.md Do/Don't); the copy is the EXPERIENCE.md
  // microcopy table verbatim.
  const approveAction = useCallback(
    async (
      _prevState: PhaseActionState | null,
      formData: FormData,
    ): Promise<PhaseActionState> => {
      let result: PhaseActionState;
      try {
        result = await approvePhase(null, formData);
      } catch {
        result = {
          ok: false,
          error: { code: "network_error", message: GENERIC_ERROR },
        };
      }
      if (result.ok) {
        showToast(
          "success",
          `Approved by ${viewerName}. This phase is now complete.`,
        );
      } else {
        showToast("destructive", result.error.message);
      }
      return result;
    },
    [showToast, viewerName],
  );
  const [, dispatchApprove, approvePending] = useActionState(approveAction, null);

  // AC 5's request-changes flow lives ENTIRELY in the inner component — its
  // inline comment error and its toast render there, and the inner host
  // survives its own success flip (Draft+Stakeholder keeps polling, so the
  // "Returning to Draft." toast outlives the branch swap). Only the approve
  // flow needs the outer slot: its success unmounts the inner host.
  return (
    <>
      {poll || visible ? (
        <SignoffControlsInner
          discoveryId={discoveryId}
          phaseType={phaseType}
          showButtons={visible}
          approvedByName={approvedByName}
          viewerName={viewerName}
          dispatchApprove={dispatchApprove}
          approvePending={approvePending}
        />
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

/* ------------------------------------------------------------------ */
/* Inner: buttons + comment reveal + read-only polling host            */
/* ------------------------------------------------------------------ */

function SignoffControlsInner({
  discoveryId,
  phaseType,
  showButtons,
  approvedByName,
  viewerName,
  dispatchApprove,
  approvePending,
}: {
  discoveryId: string;
  phaseType: PhaseType;
  showButtons: boolean;
  approvedByName: string | null;
  viewerName: string;
  dispatchApprove: (formData: FormData) => void;
  approvePending: boolean;
}) {
  // Read-only polling (Story 2.4 hand-off): last-seen updatedAt for THIS
  // phase, seeded from the cycle-0 baseline. A ref — read and written inside
  // the poll's async continuation, never during render (the recurring lint
  // trap).
  const seenUpdatedAtRef = useRef<string | null>(null);
  const pollToastSeqRef = useRef(0);
  const [pollToast, setPollToast] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [pollToastClosed, setPollToastClosed] = useState(false);

  const handleCollabSnapshot = useCallback(
    (snapshot: CollabSnapshot) => {
      const row = snapshot.phases.find((p) => p.phaseType === phaseType);
      if (row === undefined) return;
      const previous = seenUpdatedAtRef.current;
      seenUpdatedAtRef.current = row.updatedAt;
      if (previous === null || row.updatedAt <= previous) return;
      // Attribution rules (2.6): silent when the writer is unnamed or self.
      if (!row.updatedByName || row.updatedBySelf) return;
      pollToastSeqRef.current += 1;
      setPollToast({ id: pollToastSeqRef.current, name: row.updatedByName });
      setPollToastClosed(false);
    },
    [phaseType],
  );

  useCollaboration(discoveryId, { onSnapshot: handleCollabSnapshot });

  // AC 4: clicking "Request Changes" reveals the required comment textarea
  // inline below the buttons. The spec names no Cancel affordance — clicking
  // the button again toggles the reveal closed.
  const [revealComment, setRevealComment] = useState(false);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  // AC 5 — the request-changes action, owned here (see the outer's comment).
  // Info toast on success (requesting changes is not "approved/done",
  // DESIGN.md Do/Don't); destructive toast for typed errors EXCEPT the
  // required-comment validation, which renders INLINE below the textarea.
  const [changesToast, setChangesToast] = useState<{
    id: number;
    variant: "info" | "destructive";
    message: string;
  } | null>(null);
  const [changesToastClosed, setChangesToastClosed] = useState(false);
  const changesToastSeqRef = useRef(0);

  const changesAction = useCallback(
    async (
      _prevState: PhaseActionState | null,
      formData: FormData,
    ): Promise<PhaseActionState> => {
      let result: PhaseActionState;
      try {
        result = await requestChanges(null, formData);
      } catch {
        result = {
          ok: false,
          error: { code: "network_error", message: GENERIC_ERROR },
        };
      }
      changesToastSeqRef.current += 1;
      if (result.ok) {
        setChangesToast({
          id: changesToastSeqRef.current,
          variant: "info",
          message: `Changes requested by ${viewerName}. Returning to Draft.`,
        });
        // Success tidy-up lives HERE, not at dispatch time (2.11 review
        // finding): a typed error must leave the typed comment in the
        // textarea. The inner host survives the success flip (Draft+
        // Stakeholder keeps polling), so this reset lands on the live
        // component instance and the reveal starts clean if the buttons
        // are used again.
        setRevealComment(false);
        setComment("");
        setCommentError(null);
      } else if (
        result.error.code === "validation_error" &&
        result.error.field === "comment"
      ) {
        // The required-comment error renders INLINE below the textarea, not
        // as a toast (UX-DR10 error state).
        setCommentError(result.error.message);
      } else {
        setChangesToast({
          id: changesToastSeqRef.current,
          variant: "destructive",
          message: result.error.message,
        });
      }
      setChangesToastClosed(false);
      return result;
    },
    [viewerName],
  );
  // Sequential client dispatch serializes double-clicks; the action's
  // invalid_state backstop catches anything that slips through.
  const [, dispatchChanges, changesPending] = useActionState(changesAction, null);
  const actionsPending = approvePending || changesPending;

  const changesToastNode =
    changesToast !== null && !changesToastClosed ? (
      <Toast
        key={changesToast.id}
        variant={changesToast.variant}
        onDismiss={() => setChangesToastClosed(true)}
      >
        {changesToast.message}
      </Toast>
    ) : null;

  if (!showButtons) {
    return (
      <>
        {pollToast !== null && !pollToastClosed ? (
          <Toast
            key={pollToast.id}
            variant="info"
            onDismiss={() => setPollToastClosed(true)}
          >
            {`Updated by ${pollToast.name}.`}
          </Toast>
        ) : null}
        {changesToastNode}
      </>
    );
  }

  const handleApprove = () => {
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("phaseType", phaseType);
    dispatchApprove(formData);
  };

  const handleSubmitChanges = () => {
    if (comment.trim() === "") {
      // Client-side pre-check of the server's required rule — same message,
      // same inline slot (the server remains the authority; its envelope
      // error lands in the same state via the action wrapper).
      setCommentError("Comment is required.");
      return;
    }
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("phaseType", phaseType);
    formData.set("comment", comment);
    // Result handling (inline error, success tidy-up) lives in the action
    // wrapper — dispatch is void-typed, and the reset must wait for the
    // result so a typed error keeps the typed comment on screen.
    dispatchChanges(formData);
  };

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        {approvedByName !== null ? (
          // EXPERIENCE.md sign-off states: already approved → disabled
          // display of who approved (server state is authoritative).
          <Button
            variant="success"
            size="lg"
            disabled
            className="w-full sm:w-auto"
          >
            {`Approved by ${approvedByName}`}
          </Button>
        ) : (
          <Button
            variant="success"
            size="lg"
            className="w-full sm:w-auto"
            disabled={actionsPending}
            onClick={handleApprove}
          >
            Approve
          </Button>
        )}
        <Button
          variant="destructive"
          size="lg"
          className="w-full sm:w-auto"
          disabled={actionsPending}
          onClick={() => {
            setRevealComment((v) => !v);
            setCommentError(null);
          }}
        >
          Request Changes
        </Button>
      </div>

      {revealComment ? (
        <div className="mt-4 flex flex-col gap-2">
          <label
            htmlFor="request-changes-comment"
            className="text-label text-on-surface"
          >
            Comment
          </label>
          <textarea
            id="request-changes-comment"
            rows={3}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (commentError !== null) setCommentError(null);
            }}
            aria-describedby={
              commentError !== null
                ? "request-changes-comment-error"
                : undefined
            }
            className="min-h-20 w-full resize-y rounded-sm border border-outline bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled"
          />
          {commentError !== null ? (
            <p
              id="request-changes-comment-error"
              role="alert"
              className="text-body-sm text-destructive"
            >
              {commentError}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-10 px-4"
              disabled={actionsPending}
              onClick={() => {
                void handleSubmitChanges();
              }}
            >
              Submit
            </Button>
          </div>
        </div>
      ) : null}

      {pollToast !== null && !pollToastClosed ? (
        <Toast
          key={pollToast.id}
          variant="info"
          onDismiss={() => setPollToastClosed(true)}
        >
          {`Updated by ${pollToast.name}.`}
        </Toast>
      ) : null}
      {changesToastNode}
    </div>
  );
}
