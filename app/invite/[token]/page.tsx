import type { Metadata } from "next";

import { verifyInviteToken } from "@/lib/invite-token";
import { prisma } from "@/lib/prisma";
import { InviteSignupForm } from "@/components/auth/invite-signup-form";

// Story 4.1 (FR3, Decision 2026-10-09) — the invite landing page: the ONLY
// unauthenticated route in the app (NFR9 posture: the token IS the gate).
// Top-level (outside the `(app)` group) so no page-level auth gate applies.
//
// A valid collaborator token renders the signup form; anything else —
// tampered signature, expired, wrong kind (guest tokens belong to Story
// 4.2's flow, which does not exist yet), or a Discovery that no longer
// exists — renders the single error state (AC 2; never leak WHICH failure).
//
// Next 16: `params` is a Promise (node_modules/next/dist/docs page.mdx).
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyInviteToken(token);

  const invalidState = (
    <main id="main-content" style={{ padding: "4rem 2rem", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Invalid invite link</h1>
      <p style={{ marginTop: "1rem", color: "hsl(0 0% 45.1%)" }}>
        This invite link is invalid or has expired. Ask for a new one.
      </p>
    </main>
  );

  if (!payload || payload.kind !== "collaborator" || !payload.role) {
    return invalidState;
  }

  const discovery = await prisma.discovery.findUnique({
    where: { id: payload.discoveryId },
    select: { name: true },
  });
  if (!discovery) {
    return invalidState;
  }

  return (
    <main id="main-content" style={{ padding: "4rem 2rem", maxWidth: "480px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
        Join {discovery.name}
      </h1>
      <p style={{ marginTop: "0.5rem", color: "hsl(0 0% 45.1%)" }}>
        You have been invited to collaborate as {payload.role}. Create your
        account to continue.
      </p>
      <InviteSignupForm token={token} discoveryId={payload.discoveryId} />
    </main>
  );
}

// Keep Next 16's metadata export shape happy — no custom metadata needed yet.
export const metadata: Metadata = { title: "Join DiscoveryDesk" };
