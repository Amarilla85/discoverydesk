import { defineRailway, project, service, preserve } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "discoverydesk";

export default defineRailway(() => {
  const discoverydesk = service("discoverydesk-app", {
    start: "npx prisma migrate deploy && npm run start",
    // builder from CaC: "NIXPACKS"
    variables: {
      // Secrets and wiring are managed outside source control (dashboard/CLI);
      // preserve() keeps the values Railway already holds.
      DATABASE_URL: preserve(),
      AUTH_SECRET: preserve(),
      RESEND_API_KEY: preserve(),
      EMAIL_FROM: preserve(),
    },
  });
  return project("discoverydesk", {
    resources: [discoverydesk],
  });
});
