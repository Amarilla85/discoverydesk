import type { CollaboratorRole } from "@prisma/client";

/*
 * Story 2.11 — the role rule (FR-1/FR-3/FR-5). This module is the SINGLE
 * source of truth for how a viewer's role resolves: never restate the
 * owner-vs-collaborator logic inline in actions or pages.
 *
 * The Discovery Owner is always the BA (FR-1: "Creating BA is automatically a
 * Collaborator with full edit access") — and createDiscovery (Story 1.4)
 * creates NO Collaborator row for the owner, so ownership IS the BA grant.
 * A non-owner resolves through their claimed Collaborator row's role.
 *
 * Pure and client-importable like lib/constants.ts, but the actual data
 * (ownerId + Collaborator rows) is fetched by the callers — the phase page
 * (read path) and actions/phases.ts (write path, AD-10). Enforcement is
 * always server-side; components only receive the resolved role.
 */

export type MemberRole = "BA" | "Stakeholder";

export function resolveCollaboratorRole({
  isOwner,
  collaboratorRole,
}: {
  isOwner: boolean;
  collaboratorRole: CollaboratorRole | null;
}): MemberRole {
  if (isOwner) return "BA";
  // Unreachable behind the owner-or-collaborator access filter (a non-owner
  // viewer always has a claimed row with userId set) — resolve defensively to
  // least privilege rather than trusting an impossible state.
  return collaboratorRole ?? "Stakeholder";
}
