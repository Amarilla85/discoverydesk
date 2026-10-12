-- Story 4.1 amendment (Mar, 2026-10-12): set a password on the Owner's
-- account. Resend cannot send from croz.net until the domain is verified
-- (403, decision log 2026-10-12), so the Owner's magic-link path is dead —
-- this gives the Owner the same email+password sign-in collaborators
-- already use. Idempotent: setting the same hash again is a no-op write.
UPDATE "User" SET "passwordHash" = '$2b$10$Fu5RHF6skMR.3P3WKBV/ze9Kq2i4vDS/b8F6e/VskLu6OdJrOZgnC' WHERE email = 'mjovanovska@croz.net';
