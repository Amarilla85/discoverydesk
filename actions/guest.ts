"use server";

import { randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/*
 * Testing-phase guest pass (Mar's decision, 2026-10-07): the public testing
 * phase needs anyone with the link to get in WITHOUT a magic-link email —
 * Resend only delivers to the owner's mailbox until noreply.croz.net is
 * verified. This action provisions a throwaway User + database Session and
 * sets the Auth.js session cookie directly. With the Prisma adapter's
 * database-session strategy the cookie carries the raw sessionToken — the
 * same value the adapter writes on a normal magic-link sign-in — so auth(),
 * signOut(), and every downstream session lookup work unchanged.
 *
 * The pending-invite claim in the signIn event does NOT run here (guests
 * have no email to claim with — by design; invites stay an email flow).
 *
 * Envelope + (prevState, formData) signature match the one-action-envelope
 * convention (actions/discoveries.ts) so the GuestButton island can dispatch
 * via useActionState — the SAME dispatch path every other working action in
 * this app uses. A Server-Component `<form action={serverFn}>` was tried
 * first and silently failed in the production build (the action never ran;
 * the 2026-10-07 deploy's button was dead in real browsers). Client islands
 * are the proven dispatch path.
 *
 * Every guest is identifiable for post-phase cleanup: email stays NULL and
 * the name is "Guest-xxxxxxxx". Cleanup = delete Users where email IS NULL
 * (sessions cascade). To end the phase: remove the GuestButton from
 * /auth/signin and delete this file.
 *
 * The action takes no arguments and returns void after setting the session
 * cookie — it does NOT call redirect(): redirect-from-action is the one
 * pattern no other action in this app uses, and it broke the production
 * dispatch path (500 in the prod build; fine in dev). The island navigates
 * client-side instead (the create-discovery-form pattern). Failures throw
 * and are surfaced by the island's catch (the generic NFR8 line).
 */
export async function signInAsGuest(): Promise<void> {
  let sessionToken: string;
  let expires: Date;
  try {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const user = await prisma.user.create({
      data: { name: `Guest-${suffix}` },
      select: { id: true },
    });
    expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    sessionToken = randomUUID();
    await prisma.session.create({
      data: { sessionToken, userId: user.id, expires },
    });
  } catch (error) {
    console.error("signInAsGuest failed:", error);
    throw new Error("Something went wrong. Please try again.");
  }
  // Cookie name/options mirror Auth.js's database-session defaults exactly.
  // Auth.js prefixes the session cookie with __Secure- whenever the request
  // is https (init.js: useSecureCookies = url.protocol === "https:") and
  // auth() only reads the prefixed name there — the 2026-10-08 deploy wrote
  // the bare name, so the action "worked" on prod while auth() never saw the
  // session (click → land back on the sign-in page; read as "button dead").
  // Match the protocol via x-forwarded-proto (https behind Railway's proxy,
  // http for a local next start), NOT NODE_ENV — a local prod build on http
  // must keep the bare name.
  const proto = (await headers()).get("x-forwarded-proto") ?? "http";
  const secure = proto === "https";
  const cookieStore = await cookies();
  cookieStore.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
}
