// Story 1.6 (deferred from the Story 1.0 review): production start entrypoint.
//
// The previous start command (`npx prisma migrate deploy && npm run start`)
// exited the container whenever Postgres was momentarily unreachable — e.g.
// during a Railway-managed Postgres restart — so every transient blip cost a
// full container crash + Railway restart with backoff. This script retries
// the migration a bounded number of times before giving up, then starts the
// server unchanged (Next 16 `next start`, port 8080 default; the Railway
// domain targets 8080 — do not change the port).
//
// Bounded on purpose: after MAX_ATTEMPTS failures we exit non-zero so Railway's
// own restart-with-backoff remains the outer safety net and a genuinely broken
// DATABASE_URL still shows up as a crash loop in the deploy logs, not an
// infinite hang. A missing DATABASE_URL fails loudly on attempt 1 (the Prisma
// CLI errors on stderr, which is inherited here).
//
// Production-only: local dev keeps `npm run dev`; migrations stay a manual
// `prisma migrate dev` locally per ARCH-7. Referenced only from
// .railway/railway.ts's start command.
import { spawn } from "node:child_process";

const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 10_000;

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code, signal) => resolve({ code, signal }));
    child.on("error", (err) => {
      console.error(`[start] failed to spawn ${command}: ${err.message}`);
      resolve({ code: 1, signal: null });
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let migrated = false;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`[start] prisma migrate deploy (attempt ${attempt}/${MAX_ATTEMPTS})`);
  const { code } = await run("npx", ["prisma", "migrate", "deploy"]);
  if (code === 0) {
    migrated = true;
    break;
  }
  if (attempt === MAX_ATTEMPTS) {
    console.error(
      `[start] migrate deploy failed ${MAX_ATTEMPTS} times (last exit ${code}) — exiting; ` +
        `Railway will restart this service with backoff.`
    );
    process.exit(1);
  }
  console.warn(`[start] migrate deploy failed (exit ${code}) — retrying in ${RETRY_DELAY_MS / 1000}s`);
  await sleep(RETRY_DELAY_MS);
}

if (!migrated) {
  // Unreachable given the loop above, but keeps the post-loop path explicit.
  process.exit(1);
}

console.log("[start] migrations applied — starting server");
const { code: serverCode, signal } = await run("npm", ["run", "start"]);
if (signal) process.exit(1);
process.exit(serverCode ?? 0);
