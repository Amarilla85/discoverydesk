/*
 * Testing-phase admin overview (Mar's decision, 2026-10-08): the Discovery
 * List filters on owner-or-collaborator (NFR9), so discoveries guests create
 * are invisible to everyone — including Mar, who needs to see what testers
 * produce during the public testing phase. The /admin/discoveries routes use
 * this module as their gate: a single read-only overview for the app owner.
 *
 * The gate is an email constant, not an env var or role: the MVP has exactly
 * one real account (Resend delivers magic links only to this mailbox until
 * noreply.croz.net is verified — the same constraint that created the guest
 * pass), so an allowlist of one is honest. Guests cannot match: they have a
 * NULL email by design (actions/guest.ts). If a second admin ever exists,
 * move this to an env-backed allowlist on Railway.
 *
 * Strictly READ-ONLY by decision: the admin pages render DiscoveryOutputView
 * content but no mutation controls — guests' work never changes under them,
 * and the existing owner-or-collaborator checks in actions/* are untouched.
 * State: recorded in _bmad-output/decision-log.md.
 */

export const OWNER_EMAIL = "mjovanovska@croz.net";

// The admin pages' gate, checked against the session's email (never the id —
// guests' ids are indistinguishable from any other user's).
export function isAdminEmail(
  email: string | null | undefined,
): email is string {
  return email === OWNER_EMAIL;
}
