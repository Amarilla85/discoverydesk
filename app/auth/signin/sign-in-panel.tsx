"use client";

import { useState } from "react";

import { PasswordSignInForm } from "./password-sign-in-form";
import { SignInForm } from "./sign-in-form";

/*
 * Post-4.1 UX amendment (Mar, 2026-10-12): the stacked two-form layout
 * read as "double sign-in" — two email fields and two submit buttons on one
 * page. One form at a time instead: email+password is the primary mode
 * (collaborators sign in with passwords; only the Owner still uses the
 * magic link), and the magic-link form is one toggle away. Both islands
 * keep their own internal state; unmounting on switch resets it, which is
 * the desired behavior on mode swap.
 */
export function SignInPanel({ callbackUrl }: { callbackUrl?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const linkButtonStyle = {
    background: "none",
    border: "none",
    padding: 0,
    color: "hsl(0 0% 45.1%)",
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: "0.875rem",
  } as const;

  if (mode === "link") {
    return (
      <div>
        <SignInForm callbackUrl={callbackUrl} />
        <p style={{ marginTop: "1rem" }}>
          <button
            type="button"
            style={linkButtonStyle}
            onClick={() => setMode("password")}
          >
            Sign in with a password instead
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <PasswordSignInForm callbackUrl={callbackUrl} />
      <p style={{ marginTop: "1rem" }}>
        <button
          type="button"
          style={linkButtonStyle}
          onClick={() => setMode("link")}
        >
          Sign in with an email link instead
        </button>
      </p>
    </div>
  );
}
