import { redirect } from "next/navigation";
import { GuestButton } from "@/components/auth/guest-button";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

// Story 1.2: sign-in page (AC 1, 4, 5). Plain functional markup — the design
// system is Story 1.3. Already signed in? Go straight to the Discovery List
// (home route until Story 1.5).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session) redirect("/");

  const params = await searchParams;
  const rawCallbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;
  // Only honor relative callback URLs — the email-link redirect is rejected
  // for unknown hosts otherwise (Story 1.2 Dev Notes).
  const callbackUrl = rawCallbackUrl?.startsWith("/") ? rawCallbackUrl : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main id="main-content" style={{ padding: "4rem 2rem", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Sign in to DiscoveryDesk</h1>
      {error ? (
        // AC 3 — expired/used/invalid verification link landed back here.
        <div style={{ marginTop: "1rem" }}>
          <p>This sign-in link has expired. Request a new one.</p>
          <p>
            <a href="/auth/signin" style={{ color: "hsl(0 0% 45.1%)" }}>
              Back to sign in
            </a>
          </p>
        </div>
      ) : (
        <SignInForm callbackUrl={callbackUrl} />
      )}

      {/* Testing-phase guest pass (Mar, 2026-10-07): anyone with the link
          gets a throwaway account in one click — no email required (Resend
          is restricted until noreply.croz.net is verified). The button is a
          client island (GuestButton) because a Server-Component form action
          silently fails to dispatch in the production build. Remove the
          island and actions/guest.ts to end the phase; guests are Users
          with a NULL email for easy cleanup. */}
      <div style={{ marginTop: "2rem", borderTop: "1px solid hsl(0 0% 90%)", paddingTop: "1.5rem" }}>
        <GuestButton />
        <p style={{ color: "hsl(0 0% 45.1%)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
          Testing phase: no email needed. Each guest gets their own workspace.
        </p>
      </div>
    </main>
  );
}
