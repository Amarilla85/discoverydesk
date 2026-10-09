"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { signUpWithInvite, type SignUpState } from "@/actions/auth";
import { signUpSchema } from "@/lib/schemas/password";

/*
 * Story 4.1 (FR3, AC 3/4/5) — the invite-landing signup island. Email +
 * password, validated client-side with signUpSchema (AD-11: the same schema
 * the server action validates — one source of truth, no duplicated copy),
 * dispatched to signUpWithInvite. On success the action has already
 * established the session — hard-navigate into the Discovery (the
 * guest-button.tsx precedent: redirect-from-action breaks the production
 * dispatch path).
 *
 * Geometry per UX-DR10: h-10 inputs, 2px destructive border in the error
 * state, role="alert" + aria-invalid inline errors (the create-discovery-
 * form / invite-sheet pattern). The server action is the backstop for
 * tampered POSTs (AD-12) — its envelope errors render in the same slots.
 *
 * The token rides the form as a hidden field; the server action re-verifies
 * it (a tampered POST without a token fails there — the page-level check is
 * only the visible layer, NFR9).
 */

export function InviteSignupForm({
  token,
  discoveryId,
}: {
  token: string;
  discoveryId: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Client-side pre-validation errors — block the dispatch entirely so an
  // invalid form never round-trips (the invite-sheet AC 4 pattern).
  const [clientErrors, setClientErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  const action = useCallback(
    async (
      _prevState: SignUpState | null,
      formData: FormData,
    ): Promise<SignUpState> => {
      try {
        return await signUpWithInvite(null, formData);
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
  const emailError =
    clientErrors.email ??
    (serverError?.field === "email" ? serverError.message : null);
  const passwordError =
    clientErrors.password ??
    (serverError?.field === "password" ? serverError.message : null);
  const formError =
    serverError &&
    serverError.field !== "email" &&
    serverError.field !== "password"
      ? serverError.message
      : null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    const parsed = signUpSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: { email?: string; password?: string } = {};
      for (const issue of parsed.error.errors) {
        const field = issue.path[0]?.toString();
        if (field === "email" && !errors.email) {
          errors.email = issue.message;
        } else if (field === "password" && !errors.password) {
          errors.password = issue.message;
        }
      }
      setClientErrors(errors);
      return;
    }
    setClientErrors({});
    const formData = new FormData();
    formData.set("token", token);
    formData.set("discoveryId", discoveryId);
    formData.set("email", parsed.data.email);
    formData.set("password", parsed.data.password);
    dispatch(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="invite-email" className="text-label text-on-surface">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "invite-email-error" : undefined}
          className={
            emailError
              ? "mt-1 h-10 w-full rounded-sm border-2 border-destructive bg-surface px-3 text-body text-on-surface"
              : "mt-1 h-10 w-full rounded-sm border border-outline bg-surface px-3 text-body text-on-surface"
          }
        />
        {emailError ? (
          <p
            id="invite-email-error"
            role="alert"
            className="mt-1 text-body-sm text-destructive"
          >
            {emailError}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="invite-password"
          className="text-label text-on-surface"
        >
          Password
        </label>
        <input
          id="invite-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={
            passwordError ? "invite-password-error" : undefined
          }
          className={
            passwordError
              ? "mt-1 h-10 w-full rounded-sm border-2 border-destructive bg-surface px-3 text-body text-on-surface"
              : "mt-1 h-10 w-full rounded-sm border border-outline bg-surface px-3 text-body text-on-surface"
          }
        />
        {passwordError ? (
          <p
            id="invite-password-error"
            role="alert"
            className="mt-1 text-body-sm text-destructive"
          >
            {passwordError}
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
        {isPending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
