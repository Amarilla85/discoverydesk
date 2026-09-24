import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { EmailConfig } from "@auth/core/providers/email";
import { prisma } from "@/lib/prisma";

// Story 1.2 (deferred from Story 1.0 review): fail fast at module load when a
// required auth secret is missing — otherwise a broken env fails opaquely at
// first request (NextAuth secret fallback, Resend 401/422).
for (const envVar of ["AUTH_SECRET", "RESEND_API_KEY", "EMAIL_FROM"] as const) {
  if (!process.env[envVar]) {
    throw new Error(
      `Missing required environment variable: ${envVar}. ` +
        `Set it in .env.local (dev) or the Railway service variables (production).`
    );
  }
}

// NextAuth v5 (beta) — magic-link email provider via Resend HTTP API (AD-2).
// No password auth, no OAuth in MVP.
//
// The provider is hand-rolled instead of using `Email()` from
// `next-auth/providers/email`: that module re-exports the Nodemailer
// provider, whose top-level `import "nodemailer"` fails the Turbopack
// build (peer dep not installed — deliberately, we never send via SMTP).
// The runtime shape below is identical to what Email() returns with our
// options; only `sendVerificationRequest` (Resend HTTP API) and `from`
// are provided, which is all a `type: "email"` provider requires.
//
// The Prisma adapter (wired below since Story 1.2) owns token storage and
// consumption via the VerificationToken model; with an adapter present,
// NextAuth defaults to database sessions.
const ResendEmailProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env.EMAIL_FROM,
  async sendVerificationRequest({ identifier, url }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: identifier,
        subject: "Sign in to DiscoveryDesk",
        html: /* html */ `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #0a0a0a;">Sign in to DiscoveryDesk</h2>
            <p style="color: #525252;">Click the button below to sign in. This link can be used once and expires shortly.</p>
            <p>
              <a href="${url}"
                 style="display: inline-block; background: #0a0a0a; color: #ffffff; padding: 10px 20px; border-radius: 4px; text-decoration: none;">
                Sign in
              </a>
            </p>
            <p style="color: #a3a3a3; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
          </div>
        `,
        text: `Sign in to DiscoveryDesk: ${url}`,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Resend send failed: ${res.status} ${await res.text()}`
      );
    }
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma), // database sessions + VerificationToken persistence (Story 1.2)
  trustHost: true, // Railway serves via proxy; without this, auth.js throws UntrustedHostError in production
  providers: [ResendEmailProvider],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
});
