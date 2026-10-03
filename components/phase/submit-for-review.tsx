"use client";

import type { PhaseType } from "@prisma/client";
import { useActionState, useCallback, useRef, useState } from "react";
import {
  submitPhaseForReview,
  type PhaseActionState,
} from "@/actions/phases";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";

/*
 * Story 2.11 (AC 1) — the "Submit for Review" action (FR-5). Primary variant,
 * 40px height (UX-DR10), in the phase card's bottom action row; visible only
 * when the viewer is the BA, the phase is Draft, and the phase has data (the
 * page owns all three conditions — DESIGN.md's "only visible when phase has
 * data").
 *
 * MOUNT CONTRACT: this component is rendered in EVERY unlocked phase branch
 * as a stable JSX slot (the page never conditionally omits it) — it renders
 * the button only while `visible`. That stability is load-bearing: the
 * action's revalidatePath flips the page server-side to the In Review branch
 * in the SAME flight response that resolves the action, so a success toast
 * held in a conditionally-rendered component would be unmounted before it
 * could display. Holding the toast here (a slot that survives the branch
 * flip) keeps "Submitted for review." (AC 1) on screen for its 2s life.
 *
 * Error copy (UX-DR25 — specified sources only): a network throw surfaces
 * EXPERIENCE.md's specified submission-failure line; typed envelope errors
 * surface their own message (the generic server_error message is already the
 * NFR8 copy).
 */
const SUBMIT_NETWORK_ERROR = "Couldn't submit for review. Try again.";

export function SubmitForReview({
  discoveryId,
  phaseType,
  visible,
}: {
  discoveryId: string;
  phaseType: PhaseType;
  visible: boolean;
}) {
  const [toast, setToast] = useState<{
    id: number;
    variant: "success" | "destructive";
    message: string;
  } | null>(null);
  const [toastClosed, setToastClosed] = useState(false);
  // Monotonic toast id: a toast arriving while the previous one plays its
  // exit animation remounts fresh (the 2.4 review finding's keying pattern).
  const toastSeqRef = useRef(0);

  const submitAction = useCallback(
    async (
      _prevState: PhaseActionState | null,
      formData: FormData,
    ): Promise<PhaseActionState> => {
      let result: PhaseActionState;
      try {
        result = await submitPhaseForReview(null, formData);
      } catch {
        result = {
          ok: false,
          error: { code: "network_error", message: SUBMIT_NETWORK_ERROR },
        };
      }
      toastSeqRef.current += 1;
      if (result.ok) {
        // AC 1, verbatim from the epics (the EXPERIENCE.md "Notifying
        // collaborators." tail is stale pre-Decision-2026-09-11 copy — no
        // notifications exist; polling-only visibility).
        setToast({
          id: toastSeqRef.current,
          variant: "success",
          message: "Submitted for review.",
        });
      } else {
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

  // Sequential client dispatch (Next 16 server-actions guide) serializes
  // double-clicks; isPending disables the button and the action's
  // invalid_state backstop catches anything that slips through.
  const [, dispatch, isPending] = useActionState(submitAction, null);

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("phaseType", phaseType);
    dispatch(formData);
  };

  return (
    <>
      {visible ? (
        <div className="mt-6 flex justify-end">
          <Button
            size="sm"
            className="h-10 px-4"
            disabled={isPending}
            onClick={handleSubmit}
          >
            Submit for Review
          </Button>
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
