import { z } from "zod";

// Story 4.2 (AC 2, FR3, Decision 2026-10-09, AD-11) — the guest join schema:
// one source of truth validated by BOTH the client island
// (components/auth/guest-join-form.tsx) and the server action
// (actions/auth.ts joinAsGuest). The display name is the guest's whole
// identity — it renders verbatim on sign-offs, comments, and submit
// attribution (AC 8) — so it is trimmed and bounded to 1–50 chars.
// The schema lives in lib/schemas/ (not actions/auth.ts) because a
// "use server" module may only export async functions.
export const guestJoinSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(50, "Display name must be 50 characters or fewer."),
});
