"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import {
  deleteDiscovery,
  type DeleteDiscoveryState,
} from "@/actions/discoveries";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import type { DiscoveryListItem } from "./discovery-list";

/*
 * Story 2.14 (ACs 7/8) — the Discovery delete confirmation. ONE island for
 * the whole Discovery List: DiscoveryList owns `deleteTarget` (the row whose
 * Delete was clicked) and this dialog is ALWAYS MOUNTED — the list-level
 * mount is the toast-survival contract (2.11/2.12): the action's
 * revalidatePath("/") removes the row in the same flight response that
 * resolves the action, so a toast held in a PER-ROW component would die with
 * its unmounting row; held here it plays out its 2 seconds. `Modal` itself
 * renders null when closed, so an idle island costs nothing.
 *
 * Copy (AC 7, UX-DR25 register): the dialog names the discovery and warns
 * that deletion permanently removes it with all 6 phases and their outputs
 * and all collaborator invites. No spec string exists for a success toast →
 * "Discovery deleted." (the 2.12 restrained precedent); a typed error keeps
 * the modal open (retryable) and surfaces its message; a network throw
 * surfaces the generic NFR8 line.
 *
 * Polling pause: NOT needed — the Discovery List page runs no polling
 * (useCollaboration is workspace-only), so there is nothing to pause.
 *
 * No navigation on success: the affordance exists only ON the Discovery
 * List, so AC 8's "redirects to the Discovery List" is satisfied by staying
 * put while the same-flight revalidation removes the row.
 */
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

export function DeleteDiscoveryDialog({
  target,
  onClose,
}: {
  target: DiscoveryListItem | null;
  onClose: () => void;
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

  const deleteAction = useCallback(
    async (
      _prevState: DeleteDiscoveryState | null,
      formData: FormData,
    ): Promise<DeleteDiscoveryState> => {
      let result: DeleteDiscoveryState;
      try {
        result = await deleteDiscovery(null, formData);
      } catch {
        result = {
          ok: false,
          error: { code: "network_error", message: GENERIC_ERROR_MESSAGE },
        };
      }
      toastSeqRef.current += 1;
      if (result.ok) {
        // Clear the target (closes the modal) BEFORE the toast lands — the
        // island stays mounted, so the toast survives.
        onClose();
        setToast({
          id: toastSeqRef.current,
          variant: "success",
          message: "Discovery deleted.",
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
    [onClose],
  );

  // Sequential client dispatch (Next 16 server-actions guide) serializes
  // double-clicks; isPending disables the Delete button.
  const [, dispatch, isPending] = useActionState(deleteAction, null);

  const handleConfirm = () => {
    if (!target) return;
    const formData = new FormData();
    formData.set("discoveryId", target.id);
    dispatch(formData);
  };

  return (
    <>
      <Modal
        open={target !== null}
        onClose={onClose}
        title="Delete this Discovery?"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-4"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-10 px-4"
              disabled={isPending || target === null}
              onClick={handleConfirm}
            >
              Delete
            </Button>
          </>
        }
      >
        {target ? (
          <>
            &ldquo;{target.name}&rdquo; will be permanently deleted, along
            with all 6 phases and their outputs and all collaborator invites.
            This cannot be undone.
          </>
        ) : null}
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
