import { z } from "zod";

// Story 1.2 (AD-11): first file in the per-feature schema directory.
// The client sign-in form validates the email string with this before
// calling signIn; server-side validation is NextAuth's job here.
export const signInSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.");
