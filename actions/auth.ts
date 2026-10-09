"use server";

import { randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { CollaboratorRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { verifyInviteToken } from "@/lib/invite-token";
import { prisma } from "@/lib/prisma";
import {
  passwordSignInSchema,
  signUpSchema,
} from "@/lib/schemas/password";

/*
 * Story 4.1 (FR3, Decision 2026-10-09, AD-2 override) — invite-gated
 * email + password accounts. Two actions: signUpWithInvite (redeem a
 * collaborator token) and signInWithPassword (returning collaborators).
 *
 * SESSION MECHANISM — the direct-provisioning fallback, NOT the NextAuth
 * Credentials provider. Verified against the installed @auth/core before
 * building (the AD-2 override's verification mandate): the credentials
 * branch of the callback action (lib/actions/callback/index.js, ~line 228)
 * only ever writes a JWT-encoded cookie via `sessionStore.chunk` — it never
 * calls the adapter's createSession. With this app's database-session
 * strategy (PrismaAdapter, lib/auth.ts), a JWT cookie would not resolve
 * against any Session row, so Credentials sign-ins would never authenticate.
 * The pre-sanctioned fallback is the pattern proven in production by
 * actions/guest.ts (2026-10-07): create the Prisma Session row and set the
 * Auth.js-named httpOnly cookie directly (including the __Secure- prefix on
 * https — the 2026-10-08 guest-deploy lesson baked into the helper below).
 *
 * Passwords: bcrypt (bcryptjs 3.x, pure JS — no native build on Railway),
 * cost 10, only the hash is stored (User.passwordHash, nullable: magic-link
 * users and guests never get one).
 *
 * Email is an IDENTIFIER (no verification email exists in MVP): signInSchema
 * lowercases it so the same value round-trips through magic-link lookups,
 * Collaborator.email matches, and Postgres's case-sensitive unique holds.
 *
 * NFR9: the signup action re-verifies the token server-side (the landing
 * page's check is only the visible layer — direct POSTs are the real
 * threat, and signup exists ONLY behind a valid token; no open signup).
 */

// AD-11: the signup/sign-in schemas live in lib/schemas/password.ts — client
// islands and these actions validate the same shapes. (A "use server" module
// may only export async functions, so the schemas cannot be exported here.)

export type SignUpState =
  | { ok: true; discoveryId: string }
  | { ok: false; error: { code: string; message: string; field?: string } };

export type PasswordSignInState =
  | { ok: true }
  | { ok: false; error: { code: string; message: string; field?: string } };

const INVALID_TOKEN_MESSAGE =
  "This invite link is invalid or has expired. Ask for a new one.";
const EMAIL_EXISTS_MESSAGE =
  "An account with this email already exists. Sign in instead.";
const BAD_CREDENTIALS_MESSAGE = "Incorrect email or password.";
const GENERIC_FAILURE = "Something went wrong. Please try again.";

/*
 * The guest.ts session-provisioning pattern, extracted for the password
 * flows. Cookie name/options mirror Auth.js's database-session defaults
 * exactly: __Secure- prefix on https (x-forwarded-proto, NOT NODE_ENV — a
 * local prod build on http keeps the bare name), httpOnly, sameSite lax.
 * With the Prisma adapter's database sessions the cookie carries the raw
 * sessionToken, so auth() resolves it like any adapter-written session.
 */
async function provisionSession(userId: string): Promise<void> {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const sessionToken = randomUUID();
  await prisma.session.create({
    data: { sessionToken, userId, expires },
  });
  const proto = (await headers()).get("x-forwarded-proto") ?? "http";
  const secure = proto === "https";
  const cookieStore = await cookies();
  cookieStore.set(
    secure ? "__Secure-authjs.session-token" : "authjs.session-token",
    sessionToken,
    { httpOnly: true, sameSite: "lax", path: "/", secure, expires },
  );
}

/*
 * AC 4 — redeem a collaborator token: create the User (email + password
 * hash) and the claimed Collaborator row (the token's role) in one
 * transaction, then establish the session. The invitee lands on the
 * Discovery (the island navigates client-side — redirect-from-action broke
 * the prod dispatch path per actions/guest.ts's comment; hard navigation is
 * the proven pattern).
 *
 * `invitedById` = the Discovery's Owner: a token flow has no inviting user
 * at hand, and "the Owner invited everyone on their Discovery" is the honest
 * semantic (the token only exists because the Owner/BA shared it). The
 * invitedBy onDelete audit gap (deferred-work ledger) is unchanged by this.
 *
 * Email uniqueness (AC 5): a pre-flight findUnique gives the friendly AC
 * message; the P2002 catch is the race backstop with the same message
 * (creating two Users for one email must be impossible — email @unique).
 */
export async function signUpWithInvite(
  _prevState: SignUpState | null,
  formData: FormData,
): Promise<SignUpState> {
  // The token rides the form as its own field; the schema covers email +
  // password only (the server re-verification below is the real token gate).
  const token = String(formData.get("token") ?? "");
  const parsed = signUpSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: issue?.message ?? "Please check the form and try again.",
        field: issue?.path[0]?.toString(),
      },
    };
  }

  // AC 7's real guard: no valid token, no account. kind "guest" payloads are
  // rejected here too (they carry no role — Story 4.2 owns that flow).
  const payload = verifyInviteToken(token);
  if (!payload || payload.kind !== "collaborator" || !payload.role) {
    return {
      ok: false,
      error: { code: "validation_error", message: INVALID_TOKEN_MESSAGE },
    };
  }
  const role = payload.role as CollaboratorRole;
  const email = parsed.data.email; // signInSchema already lowercased + trimmed

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return {
        ok: false,
        error: { code: "conflict", message: EMAIL_EXISTS_MESSAGE, field: "email" },
      };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    // Discovery existence re-check inside the transaction: a valid token
    // whose Discovery was deleted between landing and submit must fail
    // cleanly, not create an orphan User.
    const discovery = await prisma.discovery.findUnique({
      where: { id: payload.discoveryId },
      select: { id: true, ownerId: true },
    });
    if (!discovery) {
      return {
        ok: false,
        error: { code: "validation_error", message: INVALID_TOKEN_MESSAGE },
      };
    }

    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash },
        select: { id: true },
      });
      await tx.collaborator.create({
        data: {
          discoveryId: discovery.id,
          userId: user.id,
          email,
          role,
          invitedById: discovery.ownerId,
        },
      });
      return user.id;
    });

    await provisionSession(userId);
    return { ok: true, discoveryId: discovery.id };
  } catch (error) {
    // The duplicate-insert race (two concurrent signups, same email) lands
    // here as Prisma P2002 — surface the same friendly message as the
    // pre-check without leaking the raw error.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error: { code: "conflict", message: EMAIL_EXISTS_MESSAGE, field: "email" },
      };
    }
    console.error("signUpWithInvite failed:", error);
    return {
      ok: false,
      error: { code: "server_error", message: GENERIC_FAILURE },
    };
  }
}

/*
 * AC 6 — password sign-in for collaborators. Wrong email, wrong password,
 * and "email exists but has no password (magic-link/guest account)" ALL
 * return the same generic message — no user enumeration (NFR8 posture).
 * A bcrypt.compare against a fixed dummy hash keeps the no-such-user path
 * constant-time-ish with the wrong-password path.
 */
export async function signInWithPassword(
  _prevState: PasswordSignInState | null,
  formData: FormData,
): Promise<PasswordSignInState> {
  const parsed = passwordSignInSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Please enter a valid email address.",
        field: "email",
      },
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, passwordHash: true },
    });
    const DUMMY_HASH = "$2a$10$C6UzMDM.H6dfI/f/IKcEeO7VTgxjrpU8k95Lxvtqk1PGCvXnLBDF6"; // "invalid"
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const valid =
      user?.passwordHash != null &&
      (await bcrypt.compare(parsed.data.password, hash));
    if (!valid) {
      return {
        ok: false,
        error: { code: "unauthorized", message: BAD_CREDENTIALS_MESSAGE },
      };
    }

    await provisionSession(user.id);
    return { ok: true };
  } catch (error) {
    console.error("signInWithPassword failed:", error);
    return {
      ok: false,
      error: { code: "server_error", message: GENERIC_FAILURE },
    };
  }
}
