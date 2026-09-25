import { z } from "zod";

// Story 1.4 (AD-11): the Discovery name schema is shared by the inline create
// form (client) and the createDiscovery Server Action (server). Trim first so
// a whitespace-only name fails min(1); the 100-char rule lives here and
// nowhere else. Messages are user-facing copy (UX-DR25 voice and tone).
export const discoverySchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(100, "Name must be 100 characters or fewer.");
