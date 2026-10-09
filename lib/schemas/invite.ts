import { CollaboratorRole } from "@prisma/client";
import { z } from "zod";

import { signInSchema } from "@/lib/schemas/auth";

// Story 3.1 (FR3, AD-11): the invite form's schema — the single source of
// truth for shape AND validation, used by the invite sheet (client
// pre-validation) and the inviteCollaborator Server Action (server backstop).
//
// The email field reuses signInSchema verbatim: one line buys the exact
// UX-DR14 copy ("Please enter a valid email address.") AND the
// trim().toLowerCase() normalization the deferred-work ledger requires —
// Auth.js lowercases the sign-in identifier, so a mixed-case Collaborator
// row would never be claimed by its invitee's sign-in (1-1 review defer).
// Role rides the Prisma enum — the value the Collaborator row stores.
export const inviteSchema = z.object({
  discoveryId: z.string().min(1),
  email: signInSchema,
  role: z.nativeEnum(CollaboratorRole),
});

// Story 4.1 (FR3, Decision 2026-10-09): the invite-link form shape — role +
// Discovery, NO email (the link replaces the magic-link email as the invite
// transport; the invitee picks their own email at signup). The legacy
// inviteSchema above stays for inviteCollaborator (pre-existing pending rows
// still claim via magic-link sign-in).
export const inviteLinkSchema = z.object({
  discoveryId: z.string().min(1),
  role: z.nativeEnum(CollaboratorRole),
});
