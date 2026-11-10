"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { joinAsGuest, type SignUpState } from "@/actions/auth";
import { guestJoinSchema } from "@/lib/schemas/guest";

/*
 * Story 4.2 (AC 2, FR3, Decision 2026-10-09) — the guest-landing join
 * island. ONE input: the display name (1–50 chars, trimmed), validated
 * client-side with guestJoinSchema (AD-11: the same schema the server
 * action validates — one source of truth, no duplicated copy), dispatched
 * to joinAsGuest. On success the action has already established the
 * session — hard-navigate into the Discovery (the invite-signup-form /
 * guest-button precedent: redirect-from-action breaks the production
 * dispatch path; a hard navigation also guarantees the brand-new cookie
 * rides a full server render).
 *
 * Geometry per UX-DR10: h-10 input, 2px destructive border in the error
 * state, role="alert" + aria-invalid inline errors (the invite-signup-form
 * pattern). The server action is the backstop for tampered POSTs (AD-12) —
 * its envelope errors render in the same slots.
 *
 * The token rides the form as a hidden field; the server action re-verifies
 * it (a tampered POST without a valid token fails there — the page-level
 * check is only the visible layer, NFR9). No email, no password: the guest
 * identity IS the display name (set once; no editing post-join — story
 * scope guard).
 */
export function GuestJoinForm({
  token,
  discoveryId,
}: {
  token: string;
  discoveryId: string;
}) {
  const [name, setName] = useState("");
  // Client-side pre-validation error — blocks the dispatch entirely so an
  // invalid form never round-trips (the invite-signup-form pattern).
  const [clientError, setClientError] = useState<string | null>(null);

  const action = useCallback(
    async (
      _prevState: SignUpState | null,
      formData: FormData,
    ): Promise<SignUpState> => {
      try {
        return await joinAsGuest(null, formData);
      } catch {
        return {
          ok: false,
          error: {
            code: "network_error",
            message: "Something went wrong. Please try again.",
          },
        };
      }
    },
    [],
  );

  const [state, dispatch, isPending] = useActionState(action, null);

  // On success the session is live — navigate client-side, once (the effect
  // guards against double navigation in React 19's strict re-runs).
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (state?.ok && !navigatedRef.current) {
      navigatedRef.current = true;
      window.location.assign(`/discoveries/${state.discoveryId}`);
    }
  }, [state]);

  const serverError = state && !state.ok ? state.error : null;
  const nameError =
    clientError ?? (serverError?.field === "name" ? serverError.message : null);
  const formError =
    serverError && serverError.field !== "name" ? serverError.message : null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    const parsed = guestJoinSchema.safeParse({ name });
    if (!parsed.success) {
      setClientError(parsed.error.errors[0]?.message ?? null);
      return;
    }
    setClientError(null);
    const formData = new FormData();
    formData.set("token", token);
    formData.set("discoveryId", discoveryId);
    formData.set("name", parsed.data.name);
    dispatch(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="guest-name" className="text-label text-on-surface">
          Display name
        </label>
        <input
          id="guest-name"
          name="name"
          type="text"
          autoComplete="off"
          maxLength={50}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "guest-name-error" : undefined}
          className={
            nameError
              ? "mt-1 h-10 w-full rounded-sm border-2 border-destructive bg-surface px-3 text-body text-on-surface"
              : "mt-1 h-10 w-full rounded-sm border border-outline bg-surface px-3 text-body text-on-surface"
          }
        />
        {nameError ? (
          <p
            id="guest-name-error"
            role="alert"
            className="mt-1 text-body-sm text-destructive"
          >
            {nameError}
          </p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="text-body-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="h-10 rounded-sm bg-primary px-4 text-body font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Joining…" : "Join as guest"}
      </button>
    </form>
  );
}
