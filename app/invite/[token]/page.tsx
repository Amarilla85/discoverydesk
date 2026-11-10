import type { Metadata } from "next";

import { verifyInviteToken } from "@/lib/invite-token";
import { prisma } from "@/lib/prisma";
import { GuestJoinForm } from "@/components/auth/guest-join-form";
import { InviteSignupForm } from "@/components/auth/invite-signup-form";

// Story 4.1 (FR3, Decision 2026-10-09) — the invite landing page: the ONLY
// unauthenticated route in the app (NFR9 posture: the token IS the gate).
// Top-level (outside the `(app)` group) so no page-level auth gate applies.
//
// A valid collaborator token renders the signup form (Story 4.1); a valid
// GUEST token renders the display-name join form (Story 4.2's branch). A
// guest join requires NO account — the display name becomes the whole
// identity (User.email stays NULL) and joining drops the guest straight
// into the Discovery as a Stakeholder-class collaborator. Anything else —
// tampered signature, expired, or a Discovery that no longer exists —
// renders the single error state (AC 2; never leak WHICH failure).
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

  if (!payload || (payload.kind !== "collaborator" && payload.kind !== "guest")) {
    return invalidState;
  }

  const discovery = await prisma.discovery.findUnique({
    where: { id: payload.discoveryId },
    select: { name: true },
  });
  if (!discovery) {
    return invalidState;
  }

  // Story 4.2 (AC 2): the guest branch — no account, just a display name.
  if (payload.kind === "guest") {
    return (
      <main id="main-content" style={{ padding: "4rem 2rem", maxWidth: "480px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          Join {discovery.name}
        </h1>
        <p style={{ marginTop: "0.5rem", color: "hsl(0 0% 45.1%)" }}>
          You have been invited as a guest. Enter a display name to join —
          no account needed.
        </p>
        <GuestJoinForm token={token} discoveryId={payload.discoveryId} />
      </main>
    );
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
