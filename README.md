# DiscoveryDesk

A 7-phase guided product discovery platform (BA workspace with stakeholder sign-off), built with Next.js 16 (App Router), Prisma 6 + PostgreSQL, and NextAuth v5 magic-link auth via Resend.

## Local development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env.local` and fill in real values (never commit `.env.local`):

   | Variable | Notes |
   |---|---|
   | `DATABASE_URL` | Postgres connection string. Local dev expects a local Postgres instance (the Homebrew `postgresql@16` setup uses `postgresql://<user>@localhost:5432/discoverydesk`). |
   | `AUTH_SECRET` | Generate with `openssl rand -base64 32`. |
   | `RESEND_API_KEY` | Resend API key for magic-link emails. |
   | `EMAIL_FROM` | Verified sender address, e.g. `DiscoveryDesk <onboarding@resend.dev>`. Note: `onboarding@resend.dev` only delivers to the Resend account owner until a custom domain is verified. |

   Tip: the Prisma CLI does **not** read `.env.local` — export the variables inline for `prisma` commands:

   ```bash
   export $(grep '^DATABASE_URL=' .env.local | xargs)
   ```

3. **Set up the database**

   ```bash
   npx prisma migrate dev   # applies migrations; run `npx prisma generate` if Prisma Client is stale
   ```

4. **Run**

   ```bash
   npm run dev
   ```

   Sign in with a magic link at `http://localhost:3000` (redirects to `/auth/signin`).

## Deployment (Railway)

Two services in the `discoverydesk` Railway project: `discoverydesk-app` (Next.js, this repo) and `discoverydesk-db` (managed Postgres). Configuration lives in `.railway/railway.ts` (Railway IaC — `railway.json` is deprecated and ignored by Railway).

- **Deploys:** push to `main` → Railway builds and deploys. A manual `npx -y @railway/cli up --service discoverydesk-app` (run from this directory) is the fallback.
- **Migrations:** the start script (`scripts/start.mjs`) runs `prisma migrate deploy` with a bounded retry before starting the server. Locally, migrations are always manual `prisma migrate dev` — never run `migrate dev` against production.
- **Health:** `GET /api/health` returns 200 when the app is serving; it's wired as the Railway healthcheck (`deploy.healthcheckPath`).
- **Port:** Railway injects `PORT` (8080) and the domain targets it; don't hardcode ports anywhere.
- **Secrets:** all real values live in Railway service variables (managed via dashboard/CLI) — `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`. `AUTH_URL` (the bare production origin) must stay set: Railway's proxy doesn't send `x-forwarded-host`, and without it magic-link emails contain dead `localhost` URLs.

After changing `.railway/railway.ts`, preview the plan and apply it (the apply can trigger a redeploy):

```bash
npx -y @railway/cli config plan
npx -y @railway/cli config apply
```
