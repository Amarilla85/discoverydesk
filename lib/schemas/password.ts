import { z } from "zod";

import { signInSchema } from "@/lib/schemas/auth";

// Story 4.1 (FR3, AD-11) — the password-account schemas: one source of
// truth validated by BOTH the client islands (invite-signup-form.tsx,
// password-sign-in-form.tsx) and the server actions (actions/auth.ts).
// Email reuses signInSchema verbatim (validation copy + lowercase).
// The schemas live in lib/schemas/ (not actions/auth.ts) because a
// "use server" module may only export async functions.

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.");

export const signUpSchema = z.object({
  email: signInSchema,
  password: passwordSchema,
});

// Sign-in only needs "non-empty" — the wrong-password path is a generic
// failure either way; min-8 copy would mislead (their password may be
// shorter only if it predates this rule, which cannot happen — but a
// required-field error is still the right shape).
export const passwordSignInSchema = z.object({
  email: signInSchema,
  password: z.string().min(1, "Password is required."),
});
