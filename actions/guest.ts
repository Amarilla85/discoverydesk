"use server";

import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
 * Every guest is identifiable for post-phase cleanup: email stays NULL and
 * the name is "Guest-xxxxxxxx". Cleanup = delete Users where email IS NULL
 * (sessions cascade). To end the phase: remove the button on
 * /auth/signin and delete this file.
 */
export async function signInAsGuest(): Promise<void> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const user = await prisma.user.create({
    data: { name: `Guest-${suffix}` },
    select: { id: true },
  });
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const sessionToken = randomUUID();
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });
  // Cookie options mirror Auth.js's database-session defaults (name,
  // httpOnly, lax, root path; secure on https). redirect() throws by
  // design — it must stay outside any try/catch.
  const cookieStore = await cookies();
  cookieStore.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  });
  redirect("/");
}
