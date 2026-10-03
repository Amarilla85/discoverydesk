import { redirect } from "next/navigation";
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
    </main>
  );
}
