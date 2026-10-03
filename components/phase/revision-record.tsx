/*
 * Story 2.12 (AC 6, FR13) — the revision record, rendered below the sign-off
 * record area on a reopened phase. A Server Component mirroring
 * components/phase/signoff-record.tsx (same card styling + timestamp
 * formatting): the Revision row (Story 1.1's model — created by
 * reopenPhase in actions/phases.ts) stores identity (reopenedById); name
 * derives from the User relation at render time, the 2.11 pattern. No
 * schema change this story beyond Discovery's approval columns; the
 * Revision model itself is untouched.
 *
 * Copy: "Reopened by {name}" + timestamp (AC 6's "reopened by, timestamp").
 * No role line and no revision-history list — a single restrained entry per
 * reopen event; full revision history is post-MVP polish (story open
 * question). previousOutput stays server-side (not rendered here).
 */

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RevisionRecord({
  name,
  timestamp,
}: {
  name: string;
  timestamp: Date;
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
      <p className="text-body text-on-surface">
        Reopened by {name}
        <span className="text-on-surface-variant">
          {" · "}
          <time dateTime={timestamp.toISOString()}>
            {TIMESTAMP_FORMAT.format(timestamp)}
          </time>
        </span>
      </p>
    </div>
  );
}
