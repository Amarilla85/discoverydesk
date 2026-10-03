"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import {
  approveDiscovery,
  type DiscoveryActionState,
} from "@/actions/discoveries";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";

/*
 * Story 2.12 (ACs 1/2, FR13) — the "Mark Approved" action. Primary variant,
 * 40px height (UX-DR10), in the top bar's action cluster; visible to ALL
 * collaborators (2.11's rendering), disabled until every phase is Approved.
 *
 * MOUNT CONTRACT (the 2.11 toast-survival lesson): the approval's
 * revalidatePath flips the page server-side in the SAME flight response that
 * resolves the action — a toast held in a component the flip unmounts never
 * displays. TopBar therefore renders THIS island whenever the markApproved
 * prop exists, including on an approved discovery; the `approved` prop only
 * hides the button inside the island, so the component instance (and its
 * toast slot) survives the Approved flip and "Discovery approved." lives out
 * its 2 seconds.
 *
 * Copy (UX-DR25): success toast "Discovery approved." — no spec string exists
 * for the discovery-level confirmation (story open question); typed envelope
 * errors surface their own message; a network throw surfaces the generic
 * NFR8 line (the established unspecified-failure copy since 2.11).
 */
export function MarkApprovedButton({
  discoveryId,
  ready,
  approved,
}: {
  discoveryId: string;
  ready: boolean;
  approved: boolean;
}) {
  const [toast, setToast] = useState<{
    id: number;
    variant: "success" | "destructive";
    message: string;
  } | null>(null);
  const [toastClosed, setToastClosed] = useState(false);
  // Monotonic toast id: a toast arriving while the previous one plays its
  // exit animation remounts fresh (the 2.4 keying pattern).
  const toastSeqRef = useRef(0);

  const approveAction = useCallback(
    async (
      _prevState: DiscoveryActionState | null,
      formData: FormData,
    ): Promise<DiscoveryActionState> => {
      let result: DiscoveryActionState;
      try {
        result = await approveDiscovery(null, formData);
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
        setToast({
          id: toastSeqRef.current,
          variant: "success",
          message: "Discovery approved.",
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
  const [, dispatch, isPending] = useActionState(approveAction, null);

  const handleApprove = () => {
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    dispatch(formData);
  };

  return (
    <>
      {!approved ? (
        // Primary variant (DESIGN.md's button table lists Mark Approved as a
        // Primary use); 40px height (UX-DR10) with tighter horizontal padding
        // for the h-14 bar. Visible to ALL collaborators (2.11 rendering).
        <Button
          type="button"
          size="sm"
          className="h-10 px-4"
          disabled={!ready || isPending}
          onClick={handleApprove}
        >
          Mark Approved
        </Button>
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
