"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { signInWithPassword, type PasswordSignInState } from "@/actions/auth";
import { passwordSignInSchema } from "@/lib/schemas/password";

// Story 4.1 (FR3, AC 6) — password sign-in for collaborators with accounts.
// Sibling island to SignInForm's magic-link form, same plain inline styles
// (Story 1.2 markup; the design system is Story 1.3). Validated client-side
// with passwordSignInSchema (AD-11 shared schema), dispatched to
// signInWithPassword — which establishes the session directly (the
// provisionSession fallback; see actions/auth.ts header). On success,
// hard-navigate like GuestButton (redirect-from-action breaks the production
// dispatch path).
export function PasswordSignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Client-side pre-validation error, tracked per field so the inline
  // message is associated with the failing input (aria-describedby wiring
  // below, the invite-signup-form pattern).
  const [clientError, setClientError] = useState<{
    field: "email" | "password";
    message: string;
  } | null>(null);

  const [state, dispatch, isPending] = useActionState(
    async (
      _prevState: PasswordSignInState | null,
      formData: FormData,
    ): Promise<PasswordSignInState> => {
      try {
        return await signInWithPassword(null, formData);
      } catch {
        return {
          ok: false,
          error: {
            code: "network_error",
            message: "Failed to sign in. Please try again.",
          },
        };
      }
    },
    null,
  );

  const navigatedRef = useRef(false);
  useEffect(() => {
    if (state?.ok && !navigatedRef.current) {
      navigatedRef.current = true;
      window.location.assign(callbackUrl ?? "/");
    }
  }, [state, callbackUrl]);

  const serverError = state && !state.ok ? state.error.message : null;
  // Client pre-validation wins; the server's field-level envelope error
  // (invalid email format) fills the email slot otherwise. Wrong-credential
  // failures carry no field — they render as the form-level message.
  const emailError =
    clientError?.field === "email"
      ? clientError.message
      : state && !state.ok && state.error.field === "email"
        ? state.error.message
        : null;
  const passwordError =
    clientError?.field === "password" ? clientError.message : null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const parsed = passwordSignInSchema.safeParse({ email, password });
    if (!parsed.success) {
      // AC 6 — required-field inline error, no dispatch round-trip.
      const issue = parsed.error.errors[0];
      setClientError({
        field: issue?.path[0]?.toString() === "password" ? "password" : "email",
        message: issue?.message ?? "Please enter a valid email address.",
      });
      return;
    }
    setClientError(null);
    const formData = new FormData();
    formData.set("email", parsed.data.email);
    formData.set("password", parsed.data.password);
    dispatch(formData);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginTop: "1rem" }}>
        <label htmlFor="password-email">Email</label>
        <input
          id="password-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "password-email-error" : undefined}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
        {emailError ? (
          <p
            id="password-email-error"
            role="alert"
            style={{ color: "hsl(0 72% 51%)", marginTop: "0.25rem" }}
          >
            {emailError}
          </p>
        ) : null}
        <label htmlFor="password-input" style={{ display: "block", marginTop: "0.75rem" }}>
          Password
        </label>
        <input
          id="password-input"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-input-error" : undefined}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
        {passwordError ? (
          <p
            id="password-input-error"
            role="alert"
            style={{ color: "hsl(0 72% 51%)", marginTop: "0.25rem" }}
          >
            {passwordError}
          </p>
        ) : null}
        {serverError ? (
          <p role="alert" style={{ color: "hsl(0 72% 51%)", marginTop: "0.5rem" }}>
            {serverError}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={isPending}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1.25rem",
          background: "#0a0a0a",
          color: "#ffffff",
          border: "none",
          borderRadius: "4px",
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
