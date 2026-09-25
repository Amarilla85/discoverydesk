"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Inline-editable Discovery name for the top-bar center slot (UX-DR6).
 * Click swaps to an input; Enter/blur commits, Escape cancels. The rename
 * callback is optional until Server Actions land (Stories 1.5/2.1).
 */
export function EditableDiscoveryName({
  name,
  onRename,
}: {
  name: string;
  onRename?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  // Reset the draft when the name prop changes — adjusted during render
  // (React's documented alternative to a setState-in-effect sync).
  const [prevName, setPrevName] = useState(name);
  if (prevName !== name) {
    setPrevName(name);
    setDraft(name);
  }
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onRename?.(next);
  }

  function cancel() {
    setDraft(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") cancel();
        }}
        maxLength={100}
        aria-label="Discovery name"
        className="h-10 w-full max-w-md rounded-sm border-2 border-primary bg-surface px-3 text-h1 text-on-surface"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="truncate rounded-sm px-2 py-1 text-h1 text-on-surface hover:bg-hover-overlay"
    >
      {name}
    </button>
  );
}
