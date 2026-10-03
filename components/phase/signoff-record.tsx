/*
 * Story 2.11 (ACs 3/5) — the sign-off record, rendered back into the phase
 * view. A Server Component: name/role/timestamp derive from the Signoff row
 * + the Discovery's Collaborator rows at render time — the Signoff model
 * stores identity (userId) + type + comment, and NO schema change or
 * migration happened for this story. (Phase.signoffData stays unused for the
 * same reason: everything it could hold is derivable from the Signoff rows —
 * noted so Story 2.12 doesn't wonder.)
 *
 * Two presentational modes (EXPERIENCE.md / DESIGN.md state machine):
 * - "approved" (Approved phases, below the read-only output): "Approved by
 *   {name}" + role + timestamp.
 * - "changesRequested" (Draft phases, above the content — the returning BA
 *   must see WHY the phase came back before anything else): "Changes
 *   requested by {name}" + timestamp + comment body. Full comment THREADS
 *   are Story 3.2 (FR14); this is the single latest record.
 */

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SignoffRecord({
  mode,
  name,
  role,
  timestamp,
  comment,
}: {
  mode: "approved" | "changesRequested";
  name: string;
  // Approver's CollaboratorRole (rendered in approved mode only —
  // EXPERIENCE.md: "approver name, role, timestamp"; the changes-requested
  // row names requester + timestamp, no role).
  role: string | null;
  timestamp: Date;
  comment?: string | null;
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
      <p className="text-body text-on-surface">
        {mode === "approved"
          ? `Approved by ${name}`
          : `Changes requested by ${name}`}
        {mode === "approved" && role !== null ? (
          <span className="text-on-surface-variant"> · {role}</span>
        ) : null}
        <span className="text-on-surface-variant">
          {" · "}
          <time dateTime={timestamp.toISOString()}>
            {TIMESTAMP_FORMAT.format(timestamp)}
          </time>
        </span>
      </p>
      {mode === "changesRequested" && comment ? (
        <p className="mt-2 text-body text-on-surface">{comment}</p>
      ) : null}
    </div>
  );
}
