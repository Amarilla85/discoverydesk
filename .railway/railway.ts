import { defineRailway, project, service, preserve } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "discoverydesk";

export default defineRailway(() => {
  const discoverydesk = service("discoverydesk-app", {
    // Story 1.6: hardened start (bounded migrate retry — scripts/start.mjs)
    // plus a liveness healthcheck so Railway knows when the app is serving.
    start: "node scripts/start.mjs",
    healthcheck: "/api/health",
    // builder from CaC: "NIXPACKS"
    variables: {
      // Secrets and wiring are managed outside source control (dashboard/CLI);
      // preserve() keeps the values Railway already holds.
      DATABASE_URL: preserve(),
      AUTH_SECRET: preserve(),
      // Story 1.2 production fix: Railway's proxy doesn't send x-forwarded-host,
      // so without AUTH_URL Auth.js computes a localhost origin and magic-link
      // emails carry dead links. Must survive re-provisioning.
      AUTH_URL: preserve(),
      RESEND_API_KEY: preserve(),
      EMAIL_FROM: preserve(),
    },
  });
  return project("discoverydesk", {
    resources: [discoverydesk],
  });
});
