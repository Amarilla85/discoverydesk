"use client";

import type { PhaseType } from "@prisma/client";
import { useActionState, useCallback, useRef, useState } from "react";
import { reopenPhase, type PhaseActionState } from "@/actions/phases";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { acquirePause } from "@/hooks/use-collaboration";

/*
 * Story 2.12 (ACs 4/5, FR13) — the Owner-only "Reopen Phase" control. The
 * page owns the conditions (Discovery Owner viewing a phase on an APPROVED
 * discovery) and passes `visible`; this component renders the destructive
 * button, the confirmation modal, and the action toasts.
 *
 * Modal copy (AC 5, verbatim from the epics): title "Reopen this phase?",
 * body "Reopening this phase creates a new revision. Existing sign-offs on
 * this phase are discarded." Confirm is the destructive variant — it
 * discards sign-offs. No spec copy exists for the success toast →
 * "Phase reopened." (restrained sentence case, UX-DR25; story open question).
 * A typed error keeps the modal open (retryable) and surfaces its message;
 * a network throw surfaces the generic NFR8 line.
 *
 * MOUNT CONTRACT (the 2.11 toast-survival lesson): this component is a
 * stable slot in EVERY unlocked phase branch; `visible` only gates the
 * button. The reopen success flips the page server-side to the Draft branch
 * in the SAME flight response that resolves the action — the slot surviving
 * the flip (visible → false, component mounted) is what lets "Phase
 * reopened." display for its 2 seconds.
 *
 * Polling pause (UX-DR27): while the modal is open, polling pauses via the
 * refcounted acquirePause store — acquired on open, released on close
 * (release is idempotent; the action's success path closes via closeModal).
 */
const MODAL_PAUSE_REASON = "reopen-phase-modal";

export function ReopenPhase({
  discoveryId,
  phaseType,
  visible,
}: {
  discoveryId: string;
  phaseType: PhaseType;
  visible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{
    id: number;
    variant: "success" | "destructive";
    message: string;
  } | null>(null);
  const [toastClosed, setToastClosed] = useState(false);
  const toastSeqRef = useRef(0);
  // Release for the acquirePause acquired on open — held so the action's
  // async continuation can close the modal and release in one path.
  const releasePauseRef = useRef<(() => void) | null>(null);

  const closeModal = useCallback(() => {
    setOpen(false);
    releasePauseRef.current?.();
    releasePauseRef.current = null;
  }, []);

  const openModal = () => {
    releasePauseRef.current = acquirePause(MODAL_PAUSE_REASON);
    setOpen(true);
  };

  const reopenAction = useCallback(
    async (
      _prevState: PhaseActionState | null,
      formData: FormData,
    ): Promise<PhaseActionState> => {
      let result: PhaseActionState;
      try {
        result = await reopenPhase(null, formData);
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
        // The modal closes on success (the page flips to the Draft branch);
        // this slot survives the flip, so the toast still displays.
        closeModal();
        setToast({
          id: toastSeqRef.current,
          variant: "success",
          message: "Phase reopened.",
        });
      } else {
        // Retryable failure: keep the modal open, surface the message.
        setToast({
          id: toastSeqRef.current,
          variant: "destructive",
          message: result.error.message,
        });
      }
      setToastClosed(false);
      return result;
    },
    [closeModal],
  );

  const [, dispatch, isPending] = useActionState(reopenAction, null);

  const handleConfirm = () => {
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("phaseType", phaseType);
    dispatch(formData);
  };

  return (
    <>
      {visible ? (
        <div className="mt-6 flex justify-end">
          {/* Destructive variant: reopening discards the phase's sign-offs. */}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-10 px-4"
            onClick={openModal}
          >
            Reopen Phase
          </Button>
        </div>
      ) : null}
      <Modal
        open={open}
        onClose={closeModal}
        title="Reopen this phase?"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-4"
              onClick={closeModal}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-10 px-4"
              disabled={isPending}
              onClick={handleConfirm}
            >
              Reopen Phase
            </Button>
          </>
        }
      >
        Reopening this phase creates a new revision. Existing sign-offs on
        this phase are discarded.
      </Modal>
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
