"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { signInSchema } from "@/lib/schemas/auth";

// Story 1.2: magic-link request form (AC 1, 4). Plain functional markup —
// Story 1.3 brings the design system.
export function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signInSchema.safeParse(email);
    if (!parsed.success) {
      // AC 4 — inline error, no signIn call, no email sent.
      setValidationError("Please enter a valid email address.");
      return;
    }
    setValidationError(null);
    // CSRF is handled internally by next-auth/react; callbackUrl stays
    // relative so the post-verification redirect is honored on any host.
    try {
      // signIn() resolves when the /api/auth/signin/email POST completes.
      // On success the server redirects to /verify-request, so we set
      // submitted = true and let the browser follow that redirect.
      await signIn("email", { email: parsed.data, callbackUrl });
      setSubmitted(true);
    }
    catch {
      // Network failure, 500, etc. — user gets back to the form and
      // sees a clear error instead of a phantom "Check your email" message.
      setSubmitError("Failed to send sign-in link. Please try again.");
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginTop: "1rem" }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{ display: "block", width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
          />
          {validationError ? (
            <p role="alert" style={{ color: "hsl(0 72% 51%)", marginTop: "0.25rem" }}>
              {validationError}
            </p>
          ) : null}
          {submitError ? (
            <p role="alert" style={{ color: "hsl(0 72% 51%)", marginTop: "0.5rem" }}>
              {submitError}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1.25rem",
            background: "#0a0a0a",
            color: "#ffffff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </form>
      {submitted && (
        <div style={{ marginTop: "1rem" }}>
          <p>Check your email for a sign-in link.</p>
        </div>
      )}
    </div>
  );
}
