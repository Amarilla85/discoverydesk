"use client";

import { useState, useTransition } from "react";
import { signInAsGuest } from "@/actions/guest";

/*
 * Testing-phase guest pass button (Mar, 2026-10-07) — the dispatch island
 * for the signInAsGuest action. Client-side invocation via useTransition is
 * the PROVEN action-dispatch path in this app (a Server-Component
 * `<form action={serverFn}>` silently fails to dispatch in the production
 * build — the 2026-10-07 deploy shipped dead). On success the island does a
 * HARD navigation to the Discovery List: window.location.assign (not
 * router.push) guarantees the brand-new session cookie is sent with a full
 * server render. A failure rejects and surfaces the generic NFR8 line.
 */
export function GuestButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await signInAsGuest();
              window.location.assign("/");
            } catch {
              setError("Something went wrong. Please try again.");
            }
          });
        }}
        style={{
          padding: "0.5rem 1.25rem",
          background: "transparent",
          color: isPending ? "hsl(0 0% 45.1%)" : "#0a0a0a",
          border: "1px solid hsl(0 0% 45.1%)",
          borderRadius: "4px",
          cursor: isPending ? "default" : "pointer",
        }}
      >
        {isPending ? "Signing in…" : "Continue as guest"}
      </button>
      {error ? (
        <p role="alert" style={{ color: "hsl(0 72% 51%)", marginTop: "0.5rem" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
