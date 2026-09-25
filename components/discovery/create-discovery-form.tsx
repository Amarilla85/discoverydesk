"use client";

import { useActionState, useState } from "react";
import {
  createDiscovery,
  type CreateDiscoveryState,
} from "@/actions/discoveries";
import { Button } from "@/components/ui/button";

// Story 1.4 (AC 1, UX-DR7 create row): "Create Discovery" reveals an inline
// form — name input + "Create" button — at the top of the list.
//
// Validation messages come from the shared discoverySchema via the Server
// Action's typed error (AD-11/AD-12); the action result is authoritative, so
// there is no duplicated client-side rule and no maxLength on the input (the
// >100-character error path must stay reachable, AC 3).
//
// No navigation after create — Story 2.1 wires it (see story Dev Notes). The
// list refresh via revalidatePath is the visible confirmation.
export function CreateDiscoveryForm() {
  const [state, action, pending] = useActionState<
    CreateDiscoveryState | null,
    FormData
  >(createDiscovery, null);
  const [open, setOpen] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  // Render-time state adjustment (Story 1.3's draft-sync pattern — no
  // useEffect, which trips react-hooks/set-state-in-effect): collapse the
  // form once a creation succeeds; unmounting resets the input.
  const createdId = state?.ok ? state.discovery.id : null;
  if (createdId && createdId !== lastCreatedId) {
    setLastCreatedId(createdId);
    setOpen(false);
  }

  const error = state && !state.ok ? state.error : null;

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>Create Discovery</Button>
      </div>
    );
  }

  return (
    <form
      action={action}
      aria-label="Create a new Discovery"
      className="flex flex-col gap-2"
    >
      <label htmlFor="discovery-name" className="text-label text-on-surface">
        Name
      </label>
      <input
        id="discovery-name"
        name="name"
        type="text"
        autoComplete="off"
        autoFocus
        aria-invalid={error?.field === "name" ? true : undefined}
        aria-describedby={error ? "discovery-name-error" : undefined}
        className="h-10 rounded-sm border border-outline bg-surface px-3 text-body text-on-surface placeholder:text-on-surface-disabled"
      />
      {error ? (
        <p
          id="discovery-name-error"
          role="alert"
          className="text-body-sm text-destructive"
        >
          {error.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
