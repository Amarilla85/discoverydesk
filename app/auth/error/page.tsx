// Story 1.2 (AC 3): NextAuth's pages.error target — failed token verification
// (Verification / EmailSignin) lands here. One user-facing message for all
// failure codes per the UX microcopy binding (UX-DR25).
export default function AuthErrorPage() {
  return (
    <main id="main-content" style={{ padding: "4rem 2rem", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Sign-in failed</h1>
      <p style={{ marginTop: "1rem" }}>This sign-in link has expired. Request a new one.</p>
      <p>
        <a href="/auth/signin" style={{ color: "hsl(0 0% 45.1%)" }}>
          Back to sign in
        </a>
      </p>
    </main>
  );
}
