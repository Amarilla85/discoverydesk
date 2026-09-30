import type { PhaseState, PhaseType } from "@prisma/client";

/*
 * Story 2.4 — wire shapes for collaboration polling (AD-3, ARCH-5).
 *
 * This module is deliberately NOT "use server": a Server Action file can only
 * export async functions, and both actions/collab.ts (consumer) and
 * hooks/use-collaboration.ts (client consumer) need these types. Dates are
 * ISO 8601 strings per the architecture's wire convention — raw Date objects
 * and nanoid ids never cross to the client.
 *
 * Authoritative copy for the toasts the snapshot feeds (UX-DR25 — implement
 * exactly, never invent): "Updated by {name}." and, when the viewer has
 * unsaved edits on the same phase, "Updated by {name}. Your local changes
 * have been preserved." (UX-DR32).
 */

export type CollabPhaseSnapshot = {
  phaseType: PhaseType;
  state: PhaseState;
  output: unknown;
  updatedAt: string; // ISO 8601
  /** "Updated by {name}" attribution; null when no writer is on record. */
  updatedByName: string | null;
  /** True when the last writer is the polling user themself (their other tab) — refresh, but no toast. */
  updatedBySelf: boolean;
};

export type CollabSnapshot = {
  capturedAt: string; // ISO 8601
  phases: CollabPhaseSnapshot[];
};

/** AD-12 typed envelope; snake_case codes (auth_required, not_found, …). */
export type CollabResult =
  | { ok: true; changed: boolean; snapshot?: CollabSnapshot }
  | { ok: false; error: { code: string; message: string; field?: string } };
