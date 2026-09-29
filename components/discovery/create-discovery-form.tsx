"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
// Story 2.1 (Task 6.2): a successful create navigates straight into the new
// workspace at Phase 1 (the entry route resolves the default phase).
export function CreateDiscoveryForm() {
  const [state, action, pending] = useActionState<
    CreateDiscoveryState | null,
    FormData
  >(createDiscovery, null);
  const [open, setOpen] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);
  const router = useRouter();

  // Render-time state adjustment (Story 1.3's draft-sync pattern — no
  // useEffect, which trips react-hooks/set-state-in-effect): collapse the
  // form once a creation succeeds and enter the workspace. The
  // lastCreatedId guard makes both the setState and the navigation run
  // exactly once per creation. (Phase navigation after creation is the
  // Story 2.1 acceptance path from the epics.)
  const createdId = state?.ok ? state.discovery.id : null;
  if (createdId && createdId !== lastCreatedId) {
    setLastCreatedId(createdId);
    setOpen(false);
    router.push(`/discoveries/${createdId}`);
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
        <>
          <p
            id="discovery-name-error"
            role="alert"
            className="text-body-sm text-destructive"
          >
            {error.message}
          </p>
          {/* Review finding (1.4): a mid-form session expiry must leave a
              way forward — this error code means only the session is gone. */}
          {error.code === "auth_required" ? (
            <Link
              href="/auth/signin"
              className="text-body-sm text-primary underline underline-offset-2"
            >
              Go to sign in
            </Link>
          ) : null}
        </>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </div>
    </form>
  );
}
