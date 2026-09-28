// Story 1.6 (deferred from the Story 1.0 review): liveness endpoint wired as
// the Railway service healthcheck. Deliberately DB-free — a Postgres ping here
// would make Railway restart a healthy app during a transient DB hiccup;
// DB unreachability is surfaced by the migrate step in the start script and
// the service logs. Kept to a few lines so it cannot grow into an API surface
// (AD-10: no REST routes beyond infrastructure + the polling hook).
export async function GET() {
  return Response.json({ status: "ok" });
}
