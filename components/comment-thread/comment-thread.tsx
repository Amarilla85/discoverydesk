"use client";

import type { PhaseType } from "@prisma/client";
import { useActionState, useCallback, useRef, useState } from "react";
import {
  createComment,
  setCommentResolved,
  type CommentActionState,
} from "@/actions/comments";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { useCollaboration } from "@/hooks/use-collaboration";

/*
 * Story 3.2 (FR14, UX-DR12/UX-DR27) — the flat phase-comment thread: the
 * bottom slot of every unlocked phase card, below all phase content.
 *
 * STABLE-SLOT ISLAND (2.11/3.1 mount contract): the page renders this
 * component in every unlocked branch; it owns the add-comment action toast,
 * which must survive the same-flight RSC refresh that follows every comment
 * write (the island's own action revalidates the page).
 *
 * SERVER STATE IS THE SOURCE OF TRUTH (3.1 Task 4.8 rule): the list renders
 * directly from the `comments` prop — no local list state, no prop→state
 * sync. Fresh rows arrive via revalidatePath flights: the actor's own
 * action, or (for other collaborators) the polling seam — every comment
 * mutation touch-bumps Phase.updatedAt, the existing collab poll detects it,
 * and its revalidatePath delivers re-rendered comments as props here.
 *
 * POLLING HOST (single host per page, the 2.11 boundary): on an approved
 * phase whose discovery is NOT approved, this thread is the page's ONLY
 * live view without a host — the page passes poll=true and the inner host
 * below mounts useCollaboration bare (no onSnapshot: the snapshot's only
 * job is driving the server-side revalidation). On every other live view
 * the editor or the sign-off controls already host; on an approved
 * DISCOVERY nothing polls (the thread is frozen — nothing can change).
 *
 * WIRE SHAPE: CommentThreadComment rows are composed server-side in the
 * phase page — authorName (name ?? email ?? "Unknown", the 2.4 convention),
 * preformatted createdAtLabel (hydration-safe; the island never formats
 * dates), and server-computed canResolve (comment author or Discovery
 * Owner, FR14).
 */
export type CommentThreadComment = {
  id: string;
  authorName: string;
  /** Server-formatted (Intl, en-US medium/short) — never reformat client-side. */
  createdAtLabel: string;
  createdAtIso: string;
  body: string;
  resolved: boolean;
  canResolve: boolean;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

// Stable empty set for the fresh-ids lookup before the first flight.
const EMPTY_SET: ReadonlySet<string> = new Set();

// AC 5 (UX-DR27): the slide-in utilities the Toast uses — the comment
// appears with a brief fade + slide when a poll (or the actor's own action
// flight) delivers it. Motion-reduce disables it (2.13 baseline).
const SLIDE_IN_CLASSES =
  "animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none";

export function CommentThread({
  discoveryId,
  phaseType,
  canComment,
  poll,
  comments,
}: {
  discoveryId: string;
  phaseType: PhaseType;
  // False on an Approved Discovery: the thread renders read-only — no add
  // input, no resolve buttons (EXPERIENCE.md lifecycle: "No new comments
  // can be added.").
  canComment: boolean;
  // Mount the poll host (approved phase, discovery not approved — see the
  // file header's host table).
  poll: boolean;
  comments: CommentThreadComment[];
}) {
  // --- Add-comment action (AC 2) -----------------------------------------
  // Local form state survives the action's revalidation flight (stable
  // slot), so the textarea keeps unsaved text on a typed error and is
  // cleared only on success (result-handling in the wrapper, the
  // changesAction pattern from signoff-controls.tsx).
  const [body, setBody] = useState("");
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [toast, setToast] = useState<{
    id: number;
    message: string;
  } | null>(null);
  const [toastClosed, setToastClosed] = useState(false);
  const toastSeqRef = useRef(0);

  const showToast = useCallback((message: string) => {
    toastSeqRef.current += 1;
    setToast({ id: toastSeqRef.current, message });
    setToastClosed(false);
  }, []);

  const createCommentAction = useCallback(
    async (
      _prevState: CommentActionState | null,
      formData: FormData,
    ): Promise<CommentActionState> => {
      let result: CommentActionState;
      try {
        result = await createComment(null, formData);
      } catch {
        result = {
          ok: false,
          error: { code: "network_error", message: GENERIC_ERROR },
        };
      }
      if (result.ok) {
        // Success tidy-up lives HERE, not at dispatch time (2.11 review
        // finding): a typed error must leave the typed comment in the
        // textarea.
        setBody("");
        setBodyError(null);
      } else if (
        result.error.code === "validation_error" &&
        result.error.field === "body"
      ) {
        // The empty/too-long body error renders INLINE below the textarea,
        // not as a toast (UX-DR10 error state).
        setBodyError(result.error.message);
      } else {
        showToast(result.error.message);
      }
      return result;
    },
    [showToast],
  );
  const [, dispatchAdd, addPending] = useActionState(createCommentAction, null);

  const handleSubmit = useCallback(() => {
    if (addPending) return; // 3.1 review fix: no second dispatch mid-flight
    // Client-side pre-check of the server's required rule — same message,
    // same inline slot (the server remains the authority).
    if (body.trim() === "") {
      setBodyError("Comment is required.");
      return;
    }
    const formData = new FormData();
    formData.set("discoveryId", discoveryId);
    formData.set("phaseType", phaseType);
    formData.set("body", body);
    dispatchAdd(formData);
  }, [addPending, body, dispatchAdd, discoveryId, phaseType]);

  // --- Resolve/unresolve action (AC 3 + derived unresolve) ----------------
  const setResolvedAction = useCallback(
    async (
      _prevState: CommentActionState | null,
      formData: FormData,
    ): Promise<CommentActionState> => {
      let result: CommentActionState;
      try {
        result = await setCommentResolved(null, formData);
      } catch {
        result = {
          ok: false,
          error: { code: "network_error", message: GENERIC_ERROR },
        };
      }
      // Success renders through props (the revalidation flight flips
      // `resolved` in the row); only errors surface here.
      if (!result.ok) showToast(result.error.message);
      return result;
    },
    [showToast],
  );
  const [, dispatchResolve, resolvePending] = useActionState(
    setResolvedAction,
    null,
  );

  const handleResolve = useCallback(
    (commentId: string, resolved: boolean) => {
      if (resolvePending) return; // sequential client dispatch backstop
      const formData = new FormData();
      formData.set("discoveryId", discoveryId);
      formData.set("phaseType", phaseType);
      formData.set("commentId", commentId);
      formData.set("resolved", resolved ? "true" : "false");
      dispatchResolve(formData);
    },
    [dispatchResolve, discoveryId, phaseType, resolvePending],
  );

  // --- AC 5: slide-in bookkeeping ------------------------------------------
  // Seen comment ids + the ids that are new on the current flight. Null on
  // first render seeds with ALL current ids, so the initial server-rendered
  // list never animates (EXPERIENCE.md: the animation is for poll-detected
  // arrivals). Later flights diff against the seen set — the actor's own
  // just-submitted comment animates too (it arrives via their action's
  // flight, and it drew the eye there as well).
  //
  // Both sets are STATE adjusted during render (React's adjusting-state
  // pattern, the guarded form phase-editor.tsx and
  // editable-discovery-name.tsx use) — the react-hooks/refs rule forbids
  // touching a ref during render, and an effect would commit the comment
  // unanimated one frame before the class lands. The setState call
  // re-renders before commit, so the committed paint carries the fresh
  // marker; the adjustment is idempotent across StrictMode's double render
  // because the seen set only grows.
  const [seen, setSeen] = useState<{
    ids: Set<string>;
    fresh: Set<string>;
  } | null>(null);
  const freshOnFlight = new Set<string>();
  if (seen !== null) {
    for (const comment of comments) {
      if (!seen.ids.has(comment.id)) freshOnFlight.add(comment.id);
    }
  }
  if (seen === null || freshOnFlight.size > 0) {
    setSeen({ ids: new Set(comments.map((c) => c.id)), fresh: freshOnFlight });
  }
  const freshIds = seen?.fresh ?? EMPTY_SET;

  // --- AC 4: show/hide resolved toggle --------------------------------------
  // Default SHOWING (EXPERIENCE.md: "Resolved comments are always visible
  // (never hidden), but visually degraded"). Render-time filter over props —
  // no effect, no mirrored state.
  const [showResolved, setShowResolved] = useState(true);
  const hasResolved = comments.some((comment) => comment.resolved);
  const visibleComments = showResolved
    ? comments
    : comments.filter((comment) => !comment.resolved);

  return (
    <div className="mt-8">
      {poll ? <CommentThreadPoll discoveryId={discoveryId} /> : null}
      {canComment ? (
        // DESIGN.md comment input: textarea at top of the thread, 80px
        // min-height (min-h-20), Primary button right-aligned. The button
        // label is "Add comment" — a conscious deviation from DESIGN.md's
        // threading-era "Reply" (replies were cut by Decision 2026-09-11;
        // a Reply button on a flat list would mislead). Flagged in the
        // story's microcopy binding.
        <div className="flex flex-col gap-2">
          <label htmlFor="add-comment-body" className="text-label text-on-surface">
            Comment
          </label>
          <textarea
            id="add-comment-body"
            rows={3}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              if (bodyError !== null) setBodyError(null);
            }}
            aria-describedby={
              bodyError !== null ? "add-comment-body-error" : undefined
            }
            aria-invalid={bodyError !== null}
            className={`min-h-20 w-full resize-y rounded-sm border bg-surface px-3 py-2 text-body text-on-surface placeholder:text-on-surface-disabled ${
              bodyError !== null ? "border-destructive" : "border-outline"
            }`}
          />
          {bodyError !== null ? (
            <p
              id="add-comment-body-error"
              role="alert"
              className="text-body-sm text-destructive"
            >
              {bodyError}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-10 px-4"
              disabled={addPending}
              onClick={handleSubmit}
            >
              Add comment
            </Button>
          </div>
        </div>
      ) : null}

      {comments.length === 0 ? (
        // Empty state (EXPERIENCE.md, UX-DR25): body font, on-surface-variant,
        // no display headline.
        <p className="mt-6 text-body text-on-surface-variant">
          No comments yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {visibleComments.map((comment) => {
            const isFresh = freshIds.has(comment.id);
            return (
              <li
                key={comment.id}
                className={`group max-w-[640px] rounded-lg border border-outline-variant bg-surface-container px-4 py-3 ${
                  isFresh ? SLIDE_IN_CLASSES : ""
                } ${comment.resolved ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-label font-bold text-on-surface">
                    {comment.authorName}
                  </span>
                  {comment.canResolve && canComment ? (
                    <div className="ml-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        // FR14 grant is server-computed; the button reveals on
                        // hover AND focus-within — a hover-only interactive
                        // element would break the 2.13 keyboard baseline.
                        className="h-7 px-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                        disabled={resolvePending}
                        onClick={() =>
                          handleResolve(comment.id, !comment.resolved)
                        }
                      >
                        {comment.resolved ? "Unresolve" : "Resolve"}
                      </Button>
                    </div>
                  ) : null}
                  <span
                    className={`ml-auto flex items-center gap-2 text-caption text-on-surface-variant ${
                      comment.canResolve ? "ml-0" : ""
                    }`}
                  >
                    {comment.resolved ? <span>Resolved</span> : null}
                    <time dateTime={comment.createdAtIso}>
                      {comment.createdAtLabel}
                    </time>
                  </span>
                </div>
                <p
                  className={`mt-1 whitespace-pre-wrap break-words text-body text-on-surface ${
                    comment.resolved ? "line-through" : ""
                  }`}
                >
                  {comment.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {hasResolved ? (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResolved((value) => !value)}
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </Button>
        </div>
      ) : null}

      {toast !== null && !toastClosed ? (
        <Toast
          key={toast.id}
          variant="destructive"
          onDismiss={() => setToastClosed(true)}
        >
          {toast.message}
        </Toast>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Poll host (approved-phase views)                                    */
/* ------------------------------------------------------------------ */

/*
 * Separate component so the hook mounts/unmounts with the `poll` prop
 * (conditional hook calls would violate the rules of hooks). Bare
 * useCollaboration, no onSnapshot — see the file header's host table.
 */
function CommentThreadPoll({ discoveryId }: { discoveryId: string }) {
  useCollaboration(discoveryId);
  return null;
}
