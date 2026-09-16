import NextAuth from "next-auth";
import type { EmailConfig } from "@auth/core/providers/email";

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
// The Prisma adapter is intentionally absent until Story 1.1/1.2 add the
// User/Account/Session models and the sign-in page.
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
  providers: [ResendEmailProvider],
});
