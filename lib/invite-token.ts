import { createHmac, timingSafeEqual } from "crypto";
import { CollaboratorRole } from "@prisma/client";
import { z } from "zod";

/*
 * Story 4.1 (FR3, Decision 2026-10-09, AD-2 override) — role-encoded invite
 * tokens. Resend's unverified-domain restriction blocks magic-link delivery
 * to every address except the Owner's, so invitations ride a link the BA
 * shares through their own channels. The token is STATELESS: payload +
 * HMAC-SHA256 signature, no Invitation table, no DB lookup (the schema's
 * "no Invitation table, no token" note from Story 1.1 referred to email-
 * ownership tokens; Decision 2026-10-09 reverses the letter of that —
 * membership is granted at signup from the link — but the stateless design
 * keeps the schema unchanged).
 *
 * Tokens are NOT revocable and re-issuing a link does not invalidate old
 * ones — accepted for the test phase (Decision 2026-10-09); a revoked-link
 * story would need a DB-backed token table. Expiry defaults to 30 days.
 *
 * Kinds (one discriminator, two flows):
 *  - "collaborator": role-encoded (BA | Stakeholder) — Story 4.1 signup.
 *  - "guest"         — Story 4.2 share-link guests; no role (guests join as
 *    Stakeholder collaborators with an anonymous identity). A guest-kind
 *    payload carrying a role is structurally invalid and fails verification.
 *
 * Pure module: no Prisma, no next/headers — unit-probeable via a throwaway
 * Node script (the 2.7-2.10 QA convention). The signing secret is AUTH_SECRET
 * (the only secret this app already guards at module load, lib/auth.ts:9-16);
 * it is read lazily so importing this module in client bundles stays safe —
 * only the server actions import the sign/verify functions.
 */

export const INVITE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type InviteTokenKind = "collaborator" | "guest";

export type InviteTokenPayload = {
  discoveryId: string;
  kind: InviteTokenKind;
  role?: CollaboratorRole;
  exp: number;
};

// Structural validation of a decoded payload: kind "collaborator" REQUIRES a
// role; kind "guest" FORBIDS one (the guest role is Stakeholder by
// construction — a role in a guest payload means a tampered/malformed token).
const payloadSchema = z
  .object({
    discoveryId: z.string().min(1),
    kind: z.enum(["collaborator", "guest"]),
    role: z.nativeEnum(CollaboratorRole).optional(),
    exp: z.number().int().positive(),
  })
  .superRefine((payload, ctx) => {
    if (payload.kind === "collaborator" && payload.role === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "collaborator tokens require a role",
      });
    }
    if (payload.kind === "guest" && payload.role !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["role"],
        message: "guest tokens must not carry a role",
      });
    }
  });

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // Same fail-fast posture as lib/auth.ts's env guard — a missing secret
    // must fail loudly here, not produce unsigned tokens.
    throw new Error("Missing required environment variable: AUTH_SECRET.");
  }
  return secret;
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signInviteToken(payload: {
  discoveryId: string;
  kind: InviteTokenKind;
  role?: CollaboratorRole;
  ttlMs?: number;
}): string {
  const body: InviteTokenPayload = {
    discoveryId: payload.discoveryId,
    kind: payload.kind,
    ...(payload.role !== undefined ? { role: payload.role } : {}),
    exp: Date.now() + (payload.ttlMs ?? INVITE_TOKEN_TTL_MS),
  };
  const data = toBase64Url(JSON.stringify(body));
  const signature = toBase64Url(hmac(data, getSecret()));
  return `${data}.${signature}`;
}

export function verifyInviteToken(
  token: string | undefined | null,
): InviteTokenPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const secret = getSecret();
  const expected = hmac(data, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  // Length mismatch would make timingSafeEqual throw — guard explicitly
  // (a garbage signature is the tampered-token case, AC 2's error state).
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(parsedJson);
  if (!parsed.success) return null;
  if (parsed.data.exp <= Date.now()) return null;
  return parsed.data;
}
